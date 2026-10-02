import type { ReactNode } from "react";
import { History, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import type { SoftphoneState } from "../softphone/store";

export type Tab = "inbound" | "outbound" | "history";

export function SideNav({ tab, onChange, state }: { tab: Tab; onChange: (tab: Tab) => void; state: SoftphoneState }) {
  const items: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "inbound", label: "Entrantes", icon: <PhoneIncoming size={20} /> },
    { id: "outbound", label: "Salientes", icon: <PhoneOutgoing size={20} /> },
    { id: "history", label: "Historial", icon: <History size={20} />, badge: state.history.length || undefined },
  ];
  const liveTab = state.call && state.phase !== "wrapup" ? state.call.direction : null;

  return (
    <nav className="sidenav" aria-label="Secciones">
      {items.map((item) => (
        <button
          key={item.id}
          className={`sidenav-item ${tab === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
          aria-current={tab === item.id ? "page" : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
          {liveTab === item.id && <i className="sidenav-live" title="Llamada en curso" />}
          {item.badge !== undefined && <b className="sidenav-badge">{item.badge}</b>}
        </button>
      ))}
    </nav>
  );
}
