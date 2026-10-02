// Motor openai: WebRTC directo con OpenAI GPT-Live. El backend solo intercambia el SDP.

import { api } from "../api";
import { createLevelMeter } from "./audio";
import type { VoiceCall, VoiceCallHandlers } from "./types";

export class OpenAIVoiceCall implements VoiceCall {
  private ctx = new AudioContext();
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteAudio = new Audio();
  private operatorMeter: () => number = () => 0;
  private customerMeter: () => number = () => 0;
  private closed = false;

  constructor(
    private readonly sessionId: string,
    private readonly mic: MediaStream,
    private readonly handlers: VoiceCallHandlers,
  ) {
    this.remoteAudio.autoplay = true;
    this.remoteAudio.muted = true; // hasta que se atiende
  }

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let ready = false;
      const fail = (reason: string) => {
        if (!ready) reject(new Error(reason));
        else if (!this.closed) this.handlers.onClosed(reason, true);
      };

      const pc = new RTCPeerConnection();
      this.pc = pc;
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        this.remoteAudio.srcObject = stream;
        this.customerMeter = createLevelMeter(this.ctx, this.ctx.createMediaStreamSource(stream));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") fail("Se perdió la conexión de audio con OpenAI.");
      };

      const track = this.mic.getAudioTracks()[0]!;
      track.enabled = false; // micrófono cerrado hasta atender
      pc.addTrack(track, this.mic);
      this.operatorMeter = createLevelMeter(this.ctx, this.ctx.createMediaStreamSource(this.mic));

      // El canal de datos se crea antes de la oferta SDP.
      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        switch (ev.type) {
          case "session.started":
            ready = true;
            resolve();
            break;
          case "session.input_transcript.delta":
            this.handlers.onTranscript("operador", ev.delta, { startMs: ev.start_ms, endMs: ev.end_ms });
            break;
          case "session.output_transcript.delta":
            this.handlers.onTranscript("cliente", ev.delta, { startMs: ev.start_ms, endMs: ev.end_ms });
            break;
          case "session.closed":
            if (!this.closed) fail(`OpenAI cerró la llamada (${ev.reason}).`);
            break;
        }
      };

      (async () => {
        await pc.setLocalDescription(await pc.createOffer());
        await waitForIceGathering(pc, 1500);
        const answer = await api.connectOpenAI(this.sessionId, pc.localDescription!.sdp);
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      })().catch((err) => fail(err instanceof Error ? err.message : String(err)));
    });
  }

  answer(): void {
    // GPT-Live decide solo cuándo hablar; en salientes el prompt le indica atender con "¿Hola?".
    this.setOpen(true);
  }

  hold(): void {
    this.setOpen(false);
  }

  resume(): void {
    this.setOpen(true);
  }

  hangup(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify({ type: "session.close" }));
    // Damos un instante para que salga session.close antes de cerrar la conexión.
    setTimeout(() => {
      this.pc?.close();
      this.remoteAudio.srcObject = null;
      void this.ctx.close();
    }, 300);
  }

  operatorLevel = () => this.operatorMeter();
  customerLevel = () => this.customerMeter();

  private setOpen(open: boolean): void {
    this.mic.getAudioTracks().forEach((t) => (t.enabled = open));
    this.remoteAudio.muted = !open;
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify({ type: open ? "session.input_audio.unmute" : "session.input_audio.mute" }));
    }
  }
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs);
  });
}
