// Motor gemini: WebSocket directo con Gemini Live, con el token efímero que emite el backend
// (la persona y la voz quedan bloqueadas en el token). Audio PCM16: 16 kHz de ida, 24 kHz de vuelta.

import { api } from "../api";
import { createLevelMeter } from "./audio";
import type { VoiceCall, VoiceCallHandlers } from "./types";

// Convierte el micrófono a PCM16 en bloques de 512 muestras (32 ms a 16 kHz).
const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(512); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(512);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);`;

// Avisos de texto para el cliente simulado (su prompt sabe interpretarlos).
const NOTICE_ANSWERED = "[Aviso del sistema: suena tu teléfono y atendés la llamada.]";
const NOTICE_HOLD =
  "[Aviso del sistema: el operador te puso en espera. Escuchás música de espera y nadie te escucha. Quedate en silencio.]";
const noticeResumed = (seconds: number) =>
  `[Aviso del sistema: el operador retomó la llamada después de ${seconds} segundos en espera.]`;

export class GeminiVoiceCall implements VoiceCall {
  // Los AudioContext se crean ya, en la misma tarea que inicia la llamada.
  private captureCtx = new AudioContext({ sampleRate: 16000 });
  private playCtx = new AudioContext({ sampleRate: 24000 });
  private ws: WebSocket | null = null;
  private playOut: GainNode | null = null;
  private playHead = 0;
  private playing = new Set<AudioBufferSourceNode>();
  private micOpen = false;
  private speakerOpen = false;
  private closed = false;
  private operatorMeter: () => number = () => 0;
  private customerMeter: () => number = () => 0;

  constructor(
    private readonly sessionId: string,
    private readonly mic: MediaStream,
    private readonly handlers: VoiceCallHandlers,
  ) {}

  async connect(): Promise<void> {
    const info = await api.geminiToken(this.sessionId);

    // Captura: micrófono -> worklet PCM16 -> WebSocket.
    const ctx = this.captureCtx;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" })));
    const micSource = ctx.createMediaStreamSource(this.mic);
    const capture = new AudioWorkletNode(ctx, "pcm-capture");
    const sink = ctx.createGain();
    sink.gain.value = 0; // el worklet tiene que llegar al destino para procesar
    micSource.connect(capture).connect(sink).connect(ctx.destination);
    this.operatorMeter = createLevelMeter(ctx, micSource);

    // Reproducción: bloques PCM agendados uno detrás de otro.
    this.playOut = this.playCtx.createGain();
    this.playOut.connect(this.playCtx.destination);
    this.customerMeter = createLevelMeter(this.playCtx, this.playOut);

    await new Promise<void>((resolve, reject) => {
      let ready = false;
      // El navegador no puede mandar headers en un WebSocket: el token va como query param.
      const ws = new WebSocket(`${info.ws_url}?access_token=${encodeURIComponent(info.token)}`);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      const decoder = new TextDecoder();

      ws.onopen = () => ws.send(JSON.stringify(info.setup));
      ws.onmessage = (e) => {
        const msg = JSON.parse(typeof e.data === "string" ? e.data : decoder.decode(e.data));
        if (msg.setupComplete) {
          ready = true;
          resolve();
          return;
        }
        this.handleServerContent(msg);
      };
      ws.onclose = (e) => {
        if (this.closed) return;
        const reason = e.code === 1000 ? "Gemini cerró la llamada." : `Gemini cerró la conexión (${e.code}${e.reason ? ": " + e.reason : ""}).`;
        if (!ready) reject(new Error(reason));
        else this.handlers.onClosed(reason, e.code !== 1000);
      };
    });

    capture.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.micOpen && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ realtimeInput: { audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } } });
      }
    };
  }

  answer(customerSpeaksFirst: boolean): void {
    this.micOpen = this.speakerOpen = true;
    if (customerSpeaksFirst) this.sendText(NOTICE_ANSWERED);
  }

  hold(): void {
    this.micOpen = this.speakerOpen = false;
    this.stopPlayback();
    this.send({ realtimeInput: { audioStreamEnd: true } });
    this.sendText(NOTICE_HOLD);
  }

  resume(heldSeconds: number): void {
    this.sendText(noticeResumed(heldSeconds));
    this.micOpen = this.speakerOpen = true;
  }

  hangup(): void {
    if (this.closed) return;
    this.closed = true;
    this.micOpen = this.speakerOpen = false;
    this.stopPlayback();
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000, "fin de llamada");
    void this.captureCtx.close();
    void this.playCtx.close();
  }

  operatorLevel = () => this.operatorMeter();
  customerLevel = () => this.customerMeter();

  private handleServerContent(msg: any): void {
    const content = msg.serverContent;
    if (!content) return;
    if (content.interrupted) {
      // El operador interrumpió: se corta de inmediato lo que estaba sonando.
      this.stopPlayback();
      this.handlers.onTurnEnd();
    }
    for (const part of content.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && this.speakerOpen) this.playPcm(part.inlineData.data, part.inlineData.mimeType);
    }
    if (content.inputTranscription?.text) this.handlers.onTranscript("operador", content.inputTranscription.text);
    if (content.outputTranscription?.text && this.speakerOpen) {
      this.handlers.onTranscript("cliente", content.outputTranscription.text);
    }
    if (content.turnComplete) this.handlers.onTurnEnd();
  }

  private playPcm(base64: string, mimeType?: string): void {
    const rate = Number(/rate=(\d+)/.exec(mimeType ?? "")?.[1] ?? 24000);
    const pcm = fromBase64(base64);
    const ctx = this.playCtx;
    const buffer = ctx.createBuffer(1, pcm.length, rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i]! / 32768;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playOut!);
    // Pequeño colchón al empezar cada respuesta para absorber variaciones de red.
    if (this.playHead < ctx.currentTime) this.playHead = ctx.currentTime + 0.04;
    source.start(this.playHead);
    this.playHead += buffer.duration;
    this.playing.add(source);
    source.onended = () => this.playing.delete(source);
  }

  private stopPlayback(): void {
    for (const source of this.playing) {
      try {
        source.stop();
      } catch {
        // ya había terminado
      }
    }
    this.playing.clear();
    this.playHead = 0;
  }

  private sendText(text: string): void {
    this.send({ realtimeInput: { text } });
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}
