import type { Direction } from "../api";
import type { HistoryItem } from "../softphone/store";
import { formatDuration } from "../util";

/** Indicadores del día a partir del historial, como en el tablero de un call center. */
export function Stats({ history, direction }: { history: HistoryItem[]; direction: Direction }) {
  const items = history.filter((h) => h.report.scenario.direction === direction);
  const evaluated = items.filter((h) => h.report.evaluation);
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

  const aht = avg(items.map((h) => h.report.metrics.total_seconds));
  const csat = avg(evaluated.map((h) => h.report.evaluation!.customer_satisfaction));
  const resolved = evaluated.length
    ? evaluated.filter((h) => h.report.evaluation!.resolution === "resuelto").length / evaluated.length
    : null;

  return (
    <div className="stats">
      <div className="stat">
        <small>{direction === "inbound" ? "Atendidas" : "Realizadas"}</small>
        <strong>{items.length}</strong>
      </div>
      <div className="stat">
        <small>Duración promedio</small>
        <strong>{aht === null ? "—" : formatDuration(aht)}</strong>
      </div>
      <div className="stat">
        <small>Satisfacción promedio</small>
        <strong>{csat === null ? "—" : `${csat.toFixed(1)} / 5`}</strong>
      </div>
      <div className="stat">
        <small>Resueltas</small>
        <strong>{resolved === null ? "—" : `${Math.round(resolved * 100)} %`}</strong>
      </div>
    </div>
  );
}
