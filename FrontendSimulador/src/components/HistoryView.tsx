import { FileText, PhoneIncoming, PhoneOutgoing, Star, Trash2 } from "lucide-react";
import { softphone, type SoftphoneState } from "../softphone/store";
import { formatDuration } from "../util";

const RESOLUTION_SHORT = { resuelto: "Resuelto", parcial: "Parcial", no_resuelto: "Sin resolver" } as const;

export function HistoryView({ state }: { state: SoftphoneState }) {
  const { history } = state;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Historial</h2>
          <p className="muted">Tus últimas llamadas con su informe. Se guardan en este navegador.</p>
        </div>
        {history.length > 0 && (
          <button className="ghost-button" onClick={() => softphone.clearHistory()} disabled={state.phase !== "idle"}>
            <Trash2 size={15} /> Borrar historial
          </button>
        )}
      </header>

      {history.length === 0 ? (
        <section className="card case-empty">
          <FileText size={34} />
          <h3>Todavía no hay llamadas</h3>
          <p className="muted">Cuando termines una llamada, su informe aparece acá.</p>
        </section>
      ) : (
        <section className="card table-card">
          <table className="history-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Motivo</th>
                <th>Duración</th>
                <th>Satisfacción</th>
                <th>Resolución</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map(({ id, date, report }) => (
                <tr key={id}>
                  <td>{new Date(date).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>
                    <span className={`direction-badge ${report.scenario.direction}`}>
                      {report.scenario.direction === "inbound" ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
                      {report.scenario.direction === "inbound" ? "Entrante" : "Saliente"}
                    </span>
                  </td>
                  <td>{report.scenario.customer.name}</td>
                  <td className="history-title">{report.scenario.title}</td>
                  <td>{formatDuration(report.metrics.total_seconds)}</td>
                  <td>
                    {report.evaluation ? (
                      <span className="mini-stars">
                        <Star size={14} className="star-on" /> {report.evaluation.customer_satisfaction}/5
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {report.evaluation ? (
                      <span className={`resolution-chip resolution-${report.evaluation.resolution}`}>
                        {RESOLUTION_SHORT[report.evaluation.resolution]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      className="ghost-button"
                      onClick={() => softphone.openHistoryReport(id)}
                      disabled={state.phase !== "idle"}
                    >
                      Ver informe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
