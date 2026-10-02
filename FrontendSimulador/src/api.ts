// Cliente de la API del Backend Simulador. Los tipos espejan los schemas de FastAPI.

export type Engine = "openai" | "gemini";
export type Direction = "inbound" | "outbound";
export type Speaker = "operador" | "cliente";

export interface Customer {
  name: string;
  age: number;
  phone: string;
}

export interface CallbackCase {
  number: string;
  opened: string;
  reason: string;
  resolution: string;
  guidance: string[];
}

export interface ScenarioPublic {
  id: string;
  direction: Direction;
  difficulty: string;
  customer: Customer;
  /** En entrantes llega null hasta el informe: el operador tiene que descubrir el motivo. */
  title: string | null;
  case: CallbackCase | null;
}

export interface SessionInfo {
  session_id: string;
  engine: Engine;
  direction: Direction;
  status: string;
  scenario: ScenarioPublic;
  dialed_number: string | null;
}

export interface GeminiConnectInfo {
  ws_url: string;
  token: string;
  setup: Record<string, unknown>;
  expires_at: string;
}

export interface Health {
  status: string;
  default_engine: Engine;
  engines: Partial<Record<Engine, { model: string; voice: string }>>;
}

export interface Tones {
  incoming: string | null;
  outgoing: string | null;
}

export interface TranscriptLine {
  speaker: Speaker;
  text: string;
}

export interface CallMetrics {
  ring_seconds: number;
  total_seconds: number;
  talk_seconds: number;
  hold_seconds: number;
  hold_count: number;
}

export type CriterionStatus = "cumplido" | "parcial" | "no_cumplido";
export type Resolution = "resuelto" | "parcial" | "no_resuelto";

export interface Evaluation {
  customer_satisfaction: number;
  satisfaction_reason: string;
  resolution: Resolution;
  resolution_reason: string;
  scores: {
    empathy: number;
    clarity: number;
    procedure: number;
    security: number;
    call_control: number;
  };
  summary: string;
  strengths: string[];
  improvements: string[];
  criteria: { criterion: string; status: CriterionStatus; comment: string }[];
}

export interface CallReport {
  session_id: string;
  engine: Engine;
  scenario: ScenarioPublic;
  dialed_number: string | null;
  metrics: CallMetrics;
  talk: { operator_words: number; customer_words: number; operator_share: number };
  ended_by: string;
  evaluation: Evaluation | null;
  evaluation_error: string | null;
  created_at: string;
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const resp = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json" } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!resp.ok) throw new ApiError(await errorDetail(resp));
  return resp.json() as Promise<T>;
}

async function errorDetail(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    return typeof body.detail === "string" ? body.detail : `Error HTTP ${resp.status}`;
  } catch {
    return `Error HTTP ${resp.status}`;
  }
}

export const api = {
  health: () => request<Health>("/health"),
  tones: () => request<Tones>("/api/media/tones"),

  /** Próximo cliente al azar (salientes: el caso a devolver), para mostrarlo antes de llamar. */
  nextScenario: (direction: Direction) => request<ScenarioPublic>(`/api/scenarios/next?direction=${direction}`),

  createSession: (body: { engine: Engine; direction: Direction; dialed_number?: string; scenario_id?: string }) =>
    request<SessionInfo>("/api/sessions", { method: "POST", json: body }),

  /** Motor openai: intercambio SDP para la conexión WebRTC directa. */
  async connectOpenAI(sessionId: string, sdpOffer: string): Promise<string> {
    const resp = await fetch(`/api/sessions/${sessionId}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: sdpOffer,
    });
    if (!resp.ok) throw new ApiError(await errorDetail(resp));
    return resp.text();
  },

  /** Motor gemini: token efímero para el WebSocket directo. */
  geminiToken: (sessionId: string) =>
    request<GeminiConnectInfo>(`/api/sessions/${sessionId}/token`, { method: "POST" }),

  endSession: (sessionId: string) =>
    fetch(`/api/sessions/${sessionId}`, { method: "DELETE", keepalive: true }).catch(() => undefined),

  report: (sessionId: string, body: { transcript: TranscriptLine[]; metrics: CallMetrics; ended_by: string }) =>
    request<CallReport>(`/api/sessions/${sessionId}/report`, { method: "POST", json: body }),
};
