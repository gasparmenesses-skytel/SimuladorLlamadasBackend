import type { ReactNode } from "react";
import { ClipboardList, FileCheck2 } from "lucide-react";
import type { ScenarioPublic } from "../api";

export function CaseCard({ scenario, action }: { scenario: ScenarioPublic; action?: ReactNode }) {
  const c = scenario.case;
  if (!c) return null;
  return (
    <section className="card case-card">
      <header className="card-head">
        <ClipboardList size={18} />
        <h3>Caso a devolver</h3>
        <span className="case-number">{c.number}</span>
        {action}
      </header>
      <div className="case-meta">
        <div>
          <small>Cliente</small>
          <strong>{scenario.customer.name}</strong>
        </div>
        <div>
          <small>Teléfono</small>
          <strong>{scenario.customer.phone}</strong>
        </div>
        <div>
          <small>Abierto el</small>
          <strong>{c.opened}</strong>
        </div>
        <div>
          <small>Dificultad</small>
          <strong className={`difficulty difficulty-${scenario.difficulty}`}>{scenario.difficulty}</strong>
        </div>
      </div>
      <div className="case-block">
        <small>Consulta original</small>
        <p>{c.reason}</p>
      </div>
      <div className="case-block case-resolution">
        <small>
          <FileCheck2 size={14} /> Resolución a comunicar
        </small>
        <p>{c.resolution}</p>
      </div>
      {c.guidance.length > 0 && (
        <div className="case-block">
          <small>Indicaciones</small>
          <ul className="checklist">
            {c.guidance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
