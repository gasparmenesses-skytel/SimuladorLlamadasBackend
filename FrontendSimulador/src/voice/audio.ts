// Utilidades de audio compartidas: micrófono, medidores de nivel y tonos de llamada.

export function getMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

/** Devuelve una función que lee el nivel RMS (0 a 1) del nodo. */
export function createLevelMeter(ctx: AudioContext, source: AudioNode): () => number {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  return () => {
    if (ctx.state === "closed") return 0;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return Math.sqrt(sum / data.length);
  };
}

/**
 * Reproduce en loop un tono de llamada (archivo de media/). Si no hay archivo,
 * usa un "tu tuu" sintético de 425 Hz.
 */
export class TonePlayer {
  private audio: HTMLAudioElement | null = null;
  private synth: { ctx: AudioContext; timer: number } | null = null;

  play(url: string | null): void {
    this.stop();
    if (url) {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.6;
      this.audio = audio;
      audio.play().catch(() => this.playSynth());
    } else {
      this.playSynth();
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (this.synth) {
      clearTimeout(this.synth.timer);
      void this.synth.ctx.close();
      this.synth = null;
    }
  }

  private playSynth(): void {
    const ctx = new AudioContext();
    const cycle = () => {
      const t0 = ctx.currentTime + 0.02;
      for (const [start, duration] of [[0, 0.18], [0.3, 0.55]]) beep(ctx, t0 + start, duration);
      if (this.synth) this.synth.timer = window.setTimeout(cycle, 2300);
    };
    this.synth = { ctx, timer: 0 };
    cycle();
  }
}

function beep(ctx: AudioContext, at: number, duration: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 425;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.15, at + 0.015);
  gain.gain.setValueAtTime(0.15, at + duration - 0.015);
  gain.gain.linearRampToValueAtTime(0, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration);
}
