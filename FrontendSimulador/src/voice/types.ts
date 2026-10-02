import type { Speaker } from "../api";

export interface VoiceCallHandlers {
  /** Fragmento de transcripción. OpenAI manda tiempos; Gemini no. */
  onTranscript: (speaker: Speaker, text: string, timing?: { startMs: number; endMs: number }) => void;
  /** El cliente terminó su turno o lo interrumpieron (solo Gemini). */
  onTurnEnd: () => void;
  /** La conexión con el proveedor se cerró sin que el operador cortara. */
  onClosed: (reason: string, isError: boolean) => void;
}

/** Una llamada de voz directa navegador <-> proveedor (OpenAI por WebRTC o Gemini por WebSocket). */
export interface VoiceCall {
  /** Conecta con el proveedor con el micrófono y el parlante cerrados. Resuelve cuando la sesión está lista. */
  connect(): Promise<void>;
  /** Atiende: abre micrófono y parlante. En salientes, el cliente atiende y habla primero. */
  answer(customerSpeaksFirst: boolean): void;
  /** En espera: el cliente no escucha al operador y el operador no escucha al cliente. */
  hold(): void;
  resume(heldSeconds: number): void;
  hangup(): void;
  /** Nivel de audio (RMS, 0 a 1) para los medidores. */
  operatorLevel(): number;
  customerLevel(): number;
}
