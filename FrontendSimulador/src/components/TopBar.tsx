import { Cpu, PhoneCall } from "lucide-react";
import type { Engine } from "../api";
import { softphone, type SoftphoneState } from "../softphone/store";
import { StatusSelector } from "./StatusSelector";

const ENGINE_LABELS: Record<Engine, string> = { openai: "OpenAI GPT-Live", gemini: "Gemini Live" };

export function TopBar({ state }: { state: SoftphoneState }) {
  const inCall = state.phase !== "idle";
  const engines = Object.keys(state.engines) as Engine[];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo">
          <PhoneCall size={18} />
        </span>
        <div>
          <strong>SimuBank</strong>
          <small>Contact Center · Simulador de entrenamiento</small>
        </div>
      </div>

      <div className="topbar-right">
        <label className="engine-select" title="Motor de voz de la próxima llamada">
          <Cpu size={15} />
          <select
            value={state.engine ?? ""}
            disabled={inCall || engines.length < 2}
            onChange={(e) => softphone.setEngine(e.target.value as Engine)}
          >
            {engines.length === 0 && <option value="">Sin motor</option>}
            {engines.map((engine) => (
              <option key={engine} value={engine}>
                {ENGINE_LABELS[engine]}
              </option>
            ))}
          </select>
        </label>
        <StatusSelector state={state} />
        <div className="agent">
          <span className="avatar">OP</span>
          <div>
            <strong>Operador</strong>
            <small>Agente en entrenamiento</small>
          </div>
        </div>
      </div>
    </header>
  );
}
