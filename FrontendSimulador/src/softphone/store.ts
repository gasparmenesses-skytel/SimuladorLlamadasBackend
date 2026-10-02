// Estado del softphone: disponibilidad del agente, ciclo de la llamada, espera,
// métricas e informe. Es una clase con suscripción (useSyncExternalStore) porque
// el ciclo de la llamada es imperativo: timers, audio y conexiones.

import {
  api,
  type CallMetrics,
  type CallReport,
  type Direction,
  type Engine,
  type Health,
  type ScenarioPublic,
  type Speaker,
  type Tones,
  type TranscriptLine,
} from "../api";
import { errorMessage, randomBetween } from "../util";
import { getMicrophone, TonePlayer } from "../voice/audio";
import { GeminiVoiceCall } from "../voice/gemini";
import { OpenAIVoiceCall } from "../voice/openai";
import type { VoiceCall } from "../voice/types";

export type AgentStatus = "available" | "busy";
/** ringing: entrante sonando · dialing: saliente llamando · active: en llamada · held: en espera · wrapup: informe */
export type CallPhase = "idle" | "ringing" | "dialing" | "active" | "held" | "wrapup";

// Tiempos pedidos: la llamada entra entre 2 y 5 s después de ponerse disponible y suena entre 4 y 7 s.
const INBOUND_DELAY_MS: [number, number] = [2000, 5000];
const RING_MS: [number, number] = [4000, 7000];
// OpenAI manda tiempos: un hueco mayor a esto en el mismo hablante abre un turno nuevo.
const TURN_GAP_MS = 1500;
const HISTORY_KEY = "simulador.historial";
const HISTORY_MAX = 30;

export interface TranscriptEntry {
  id: number;
  speaker: Speaker;
  text: string;
}

export interface ActiveCall {
  direction: Direction;
  engine: Engine;
  sessionId: string | null;
  scenario: ScenarioPublic | null;
  dialedNumber: string | null;
  startedAt: number;
  answeredAt: number | null;
  holdStartedAt: number | null;
  holdSeconds: number;
  holdCount: number;
  transcript: TranscriptEntry[];
}

export interface WrapUp {
  call: ActiveCall;
  metrics: CallMetrics;
  report: CallReport | null;
  loading: boolean;
  error: string | null;
}

export interface HistoryItem {
  id: string;
  date: string;
  report: CallReport;
  transcript: TranscriptLine[];
}

export interface SoftphoneState {
  ready: boolean;
  engines: Health["engines"];
  engine: Engine | null;
  agentStatus: AgentStatus;
  phase: CallPhase;
  call: ActiveCall | null;
  wrapup: WrapUp | null;
  notice: { text: string; kind: "error" | "info" } | null;
  history: HistoryItem[];
  /** Salientes: el caso que el operador lee antes de llamar. */
  outboundCase: ScenarioPublic | null;
  outboundCaseStatus: "idle" | "loading" | "error";
}

export class SoftphoneStore {
  private state: SoftphoneState = {
    ready: false,
    engines: {},
    engine: null,
    agentStatus: "busy",
    phase: "idle",
    call: null,
    wrapup: null,
    notice: null,
    history: loadHistory(),
    outboundCase: null,
    outboundCaseStatus: "idle",
  };
  private listeners = new Set<() => void>();
  private tones: Tones = { incoming: null, outgoing: null };
  private tone = new TonePlayer();
  private voice: VoiceCall | null = null;
  private mic: MediaStream | null = null;
  private inboundTimer: number | undefined;
  // Cada llamada tiene un id: si el operador corta mientras conecta, las tareas viejas se descartan.
  private callSeq = 0;
  private entrySeq = 0;
  private openTurn: Record<Speaker, { id: number; lastEnd: number } | null> = { operador: null, cliente: null };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  get voiceCall(): VoiceCall | null {
    return this.voice;
  }

  async init(): Promise<void> {
    try {
      const [health, tones] = await Promise.all([api.health(), api.tones()]);
      this.tones = tones;
      this.set({ ready: true, engines: health.engines, engine: health.default_engine });
    } catch (err) {
      this.set({ notice: { kind: "error", text: `No se pudo conectar con el backend: ${errorMessage(err)}` } });
    }
  }

  setEngine(engine: Engine): void {
    this.set({ engine });
  }

  dismissNotice(): void {
    this.set({ notice: null });
  }

  async setAgentStatus(status: AgentStatus): Promise<void> {
    if (status === "available" && !(await this.ensureMicrophonePermission())) return;
    this.set({ agentStatus: status, notice: null });
    if (status === "available" && this.state.phase === "idle") this.scheduleInbound();
    if (status === "busy") this.cancelInbound();
  }

  /** Carga al azar el próximo caso a devolver (distinto del anterior) para leerlo antes de llamar. */
  async loadOutboundCase(): Promise<void> {
    if (this.state.phase !== "idle" || this.state.outboundCaseStatus === "loading") return;
    this.set({ outboundCaseStatus: "loading" });
    try {
      const scenario = await api.nextScenario("outbound");
      this.set({ outboundCase: scenario, outboundCaseStatus: "idle" });
    } catch (err) {
      this.set({
        outboundCaseStatus: "error",
        notice: { kind: "error", text: `No se pudo cargar el caso a devolver: ${errorMessage(err)}` },
      });
    }
  }

  /** Llamada saliente al cliente del caso cargado. El número marcado puede ser cualquiera. */
  async dial(number: string): Promise<void> {
    const scenario = this.state.outboundCase;
    if (this.state.phase !== "idle" || !this.state.ready || !scenario) return;
    if (!(await this.ensureMicrophonePermission())) return;
    this.cancelInbound();
    void this.startCall("outbound", number, scenario.id);
  }

  /** Cortar: durante el timbre cancela; en llamada cierra y arma el informe. */
  hangup(): void {
    const { phase } = this.state;
    if (phase === "ringing" || phase === "dialing") {
      this.abortCall();
      this.afterCall();
    } else if (phase === "active" || phase === "held") {
      void this.finishCall("operador");
    }
  }

  toggleHold(): void {
    const call = this.state.call;
    if (!call || !this.voice) return;
    if (this.state.phase === "active") {
      this.voice.hold();
      this.set({
        phase: "held",
        call: { ...call, holdStartedAt: Date.now(), holdCount: call.holdCount + 1 },
      });
    } else if (this.state.phase === "held" && call.holdStartedAt) {
      const held = (Date.now() - call.holdStartedAt) / 1000;
      this.voice.resume(Math.round(held));
      this.set({ phase: "active", call: { ...call, holdStartedAt: null, holdSeconds: call.holdSeconds + held } });
    }
  }

  closeWrapup(): void {
    // Después de una saliente, el caso ya se devolvió: la sección carga uno nuevo.
    const returnedCase = this.state.call?.direction === "outbound";
    this.set({ phase: "idle", wrapup: null, call: null, ...(returnedCase && { outboundCase: null }) });
    this.afterCall();
  }

  openHistoryReport(id: string): void {
    const item = this.state.history.find((h) => h.id === id);
    if (!item || this.state.phase !== "idle") return;
    this.set({
      phase: "wrapup",
      wrapup: { call: historyCall(item), metrics: item.report.metrics, report: item.report, loading: false, error: null },
    });
  }

  clearHistory(): void {
    saveHistory([]);
    this.set({ history: [] });
  }

  // ------------------------------------------------------------------ ciclo de la llamada

  private scheduleInbound(): void {
    this.cancelInbound();
    this.inboundTimer = window.setTimeout(() => {
      this.inboundTimer = undefined;
      if (this.state.agentStatus === "available" && this.state.phase === "idle") void this.startCall("inbound");
    }, randomBetween(...INBOUND_DELAY_MS));
  }

  private cancelInbound(): void {
    clearTimeout(this.inboundTimer);
    this.inboundTimer = undefined;
  }

  private async startCall(direction: Direction, dialedNumber?: string, scenarioId?: string): Promise<void> {
    const engine = this.state.engine;
    if (!engine) return;
    const seq = ++this.callSeq;
    this.openTurn = { operador: null, cliente: null };
    this.set({
      phase: direction === "inbound" ? "ringing" : "dialing",
      notice: null,
      call: {
        direction,
        engine,
        sessionId: null,
        // Salientes: el caso ya se conoce (el operador lo leyó), así se ve mientras suena.
        scenario: scenarioId && this.state.outboundCase?.id === scenarioId ? this.state.outboundCase : null,
        dialedNumber: dialedNumber ?? null,
        startedAt: Date.now(),
        answeredAt: null,
        holdStartedAt: null,
        holdSeconds: 0,
        holdCount: 0,
        transcript: [],
      },
    });
    this.tone.play(direction === "inbound" ? this.tones.incoming : this.tones.outgoing);
    const ringDone = sleep(randomBetween(...RING_MS));

    try {
      // Mientras suena se crea la sesión y se conecta con el proveedor: así el
      // tiempo de conexión queda escondido detrás del timbre.
      this.mic = await getMicrophone();
      const session = await api.createSession({
        engine,
        direction,
        dialed_number: dialedNumber,
        scenario_id: scenarioId,
      });
      if (seq !== this.callSeq) return void api.endSession(session.session_id);
      this.updateCall({ sessionId: session.session_id, scenario: session.scenario });

      const handlers = {
        onTranscript: (speaker: Speaker, text: string, timing?: { startMs: number; endMs: number }) => {
          if (seq === this.callSeq) this.appendTranscript(speaker, text, timing);
        },
        onTurnEnd: () => {
          this.openTurn = { operador: null, cliente: null };
        },
        onClosed: (reason: string, isError: boolean) => {
          if (seq !== this.callSeq) return;
          if (this.state.phase === "ringing" || this.state.phase === "dialing") {
            this.abortCall();
            this.cancelInbound();
            this.set({ agentStatus: "busy", notice: { kind: "error", text: reason } });
            return;
          }
          this.set({ notice: { kind: isError ? "error" : "info", text: reason } });
          void this.finishCall("sistema");
        },
      };
      this.voice =
        engine === "gemini"
          ? new GeminiVoiceCall(session.session_id, this.mic, handlers)
          : new OpenAIVoiceCall(session.session_id, this.mic, handlers);

      await Promise.all([this.voice.connect(), ringDone]);
      if (seq !== this.callSeq) return;

      // Se atiende sola: en entrantes habla primero el operador; en salientes, el cliente.
      this.tone.stop();
      this.voice.answer(direction === "outbound");
      this.set({ phase: "active" });
      this.updateCall({ answeredAt: Date.now() });
    } catch (err) {
      if (seq !== this.callSeq) return;
      this.abortCall();
      // Se pasa a Ocupado para no entrar en un bucle de llamadas fallidas.
      this.cancelInbound();
      this.set({ agentStatus: "busy", notice: { kind: "error", text: `No se pudo conectar la llamada: ${errorMessage(err)}` } });
    }
  }

  /** Corta una llamada que todavía no se atendió (sin informe). */
  private abortCall(): void {
    this.callSeq++;
    this.tone.stop();
    this.voice?.hangup();
    this.voice = null;
    this.releaseMic();
    const sessionId = this.state.call?.sessionId;
    if (sessionId) void api.endSession(sessionId);
    this.set({ phase: "idle", call: null });
  }

  private async finishCall(endedBy: "operador" | "sistema"): Promise<void> {
    const current = this.state.call;
    if (!current || !current.answeredAt || !current.sessionId) return this.abortCall();
    const seq = ++this.callSeq; // las tareas de la llamada ya no tocan el estado
    this.voice?.hangup();
    this.voice = null;
    this.tone.stop();
    this.releaseMic();

    const now = Date.now();
    const holdSeconds = current.holdSeconds + (current.holdStartedAt ? (now - current.holdStartedAt) / 1000 : 0);
    const call = { ...current, holdStartedAt: null, holdSeconds };
    const total = (now - current.answeredAt) / 1000;
    const metrics: CallMetrics = {
      ring_seconds: round1((current.answeredAt - current.startedAt) / 1000),
      total_seconds: round1(total),
      talk_seconds: round1(Math.max(0, total - holdSeconds)),
      hold_seconds: round1(holdSeconds),
      hold_count: current.holdCount,
    };
    this.set({ phase: "wrapup", call, wrapup: { call, metrics, report: null, loading: true, error: null } });

    try {
      const transcript = call.transcript
        .map((e) => ({ speaker: e.speaker, text: e.text.trim() }))
        .filter((e) => e.text.length > 0);
      const report = await api.report(call.sessionId!, { transcript, metrics, ended_by: endedBy });
      const history = [
        { id: report.session_id, date: report.created_at, report, transcript },
        ...this.state.history,
      ].slice(0, HISTORY_MAX);
      saveHistory(history);
      if (this.state.wrapup?.call === call && seq === this.callSeq) {
        this.set({ history, wrapup: { ...this.state.wrapup, report, loading: false } });
      } else {
        this.set({ history });
      }
    } catch (err) {
      if (this.state.wrapup?.call === call) {
        this.set({ wrapup: { ...this.state.wrapup, loading: false, error: errorMessage(err) } });
      }
    }
  }

  private afterCall(): void {
    if (this.state.agentStatus === "available" && this.state.phase === "idle") this.scheduleInbound();
  }

  private appendTranscript(speaker: Speaker, text: string, timing?: { startMs: number; endMs: number }): void {
    const call = this.state.call;
    if (!call) return;
    const open = this.openTurn[speaker];
    const continues = open && (!timing || timing.startMs - open.lastEnd <= TURN_GAP_MS);
    let transcript: TranscriptEntry[];
    if (continues) {
      transcript = call.transcript.map((e) => (e.id === open.id ? { ...e, text: e.text + text } : e));
      open.lastEnd = timing?.endMs ?? open.lastEnd;
    } else {
      const entry = { id: ++this.entrySeq, speaker, text };
      transcript = [...call.transcript, entry];
      this.openTurn[speaker] = { id: entry.id, lastEnd: timing?.endMs ?? 0 };
    }
    this.set({ call: { ...call, transcript } });
  }

  private updateCall(patch: Partial<ActiveCall>): void {
    if (this.state.call) this.set({ call: { ...this.state.call, ...patch } });
  }

  private async ensureMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await getMicrophone();
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      this.set({
        agentStatus: "busy",
        notice: { kind: "error", text: `Sin acceso al micrófono: ${errorMessage(err)}. Permitilo en el navegador para atender llamadas.` },
      });
      return false;
    }
  }

  private releaseMic(): void {
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
  }

  private set(patch: Partial<SoftphoneState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const round1 = (n: number) => Math.round(n * 10) / 10;

function historyCall({ report, transcript }: HistoryItem): ActiveCall {
  return {
    direction: report.scenario.direction,
    engine: report.engine,
    sessionId: report.session_id,
    scenario: report.scenario,
    dialedNumber: report.dialed_number,
    startedAt: 0,
    answeredAt: 0,
    holdStartedAt: null,
    holdSeconds: report.metrics.hold_seconds,
    holdCount: report.metrics.hold_count,
    transcript: (transcript ?? []).map((line, i) => ({ id: i, ...line })),
  };
}

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // el historial es una comodidad: si no se puede guardar, se sigue igual
  }
}

export const softphone = new SoftphoneStore();
