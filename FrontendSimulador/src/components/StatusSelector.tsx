import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { softphone, type AgentStatus, type SoftphoneState } from "../softphone/store";

type Led = "green" | "red" | "blue" | "amber" | "purple";

/** Lo que muestra la luz: la disponibilidad elegida o, durante una llamada, el estado de la llamada. */
export function presence(state: SoftphoneState): { label: string; led: Led; blink: boolean } {
  switch (state.phase) {
    case "ringing":
      return { label: "Llamada entrante", led: "blue", blink: true };
    case "dialing":
      return { label: "Llamando", led: "blue", blink: true };
    case "active":
      return { label: "En llamada", led: "blue", blink: false };
    case "held":
      return { label: "En espera", led: "amber", blink: true };
    case "wrapup":
      return { label: "Post-llamada", led: "purple", blink: false };
    default:
      return state.agentStatus === "available"
        ? { label: "Disponible", led: "green", blink: true }
        : { label: "Ocupado", led: "red", blink: true };
  }
}

const OPTIONS: { status: AgentStatus; label: string; hint: string; led: Led }[] = [
  { status: "available", label: "Disponible", hint: "Recibís llamadas entrantes", led: "green" },
  { status: "busy", label: "Ocupado", hint: "No entran llamadas", led: "red" },
];

export function StatusSelector({ state }: { state: SoftphoneState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { label, led, blink } = presence(state);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (status: AgentStatus) => {
    setOpen(false);
    void softphone.setAgentStatus(status);
  };

  return (
    <div className="status" ref={ref}>
      <button
        className={`status-pill status-${led}`}
        onClick={() => setOpen((v) => !v)}
        disabled={!state.ready}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`led led-${led} ${blink ? "led-blink" : ""}`} />
        <span>{label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="status-menu" role="menu">
          {state.phase !== "idle" && <p className="status-menu-note">Se aplica al terminar la llamada.</p>}
          {OPTIONS.map((option) => (
            <button key={option.status} role="menuitem" className="status-option" onClick={() => choose(option.status)}>
              <span className={`led led-${option.led}`} />
              <span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
              {state.agentStatus === option.status && <Check size={16} className="status-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
