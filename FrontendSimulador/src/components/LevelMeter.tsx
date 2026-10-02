import { useEffect, useRef } from "react";
import { softphone } from "../softphone/store";

const BARS = 16;

/** Ecualizador animado con el nivel de audio real de cada lado de la llamada. */
export function LevelMeter({ who, active }: { who: "operador" | "cliente"; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[];
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const call = softphone.voiceCall;
      const level = call ? (who === "operador" ? call.operatorLevel() : call.customerLevel()) : 0;
      const value = Math.min(1, level * 6);
      const t = performance.now() / 160;
      bars.forEach((bar, i) => {
        const shape = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + t));
        bar.style.transform = `scaleY(${Math.max(0.1, value * shape)})`;
      });
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      bars.forEach((bar) => (bar.style.transform = "scaleY(0.1)"));
    };
  }, [active, who]);

  return (
    <div className={`level level-${who}`}>
      <span>{who === "operador" ? "Vos" : "Cliente"}</span>
      <div className="level-bars" ref={ref} aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  );
}
