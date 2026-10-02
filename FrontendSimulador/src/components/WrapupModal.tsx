import { useEffect } from "react";
import { X } from "lucide-react";
import { softphone, type AgentStatus, type WrapUp } from "../softphone/store";
import { ReportView } from "./ReportView";

export function WrapupModal({ wrapup, agentStatus }: { wrapup: WrapUp; agentStatus: AgentStatus }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") softphone.closeWrapup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Informe de la llamada">
      <div className="modal">
        <header className="modal-head">
          <h2>Informe de la llamada</h2>
          <button className="icon-button" onClick={() => softphone.closeWrapup()} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">
          <ReportView wrapup={wrapup} />
        </div>
        <footer className="modal-foot">
          <span className="muted small">
            Al cerrar quedás{" "}
            <b>{agentStatus === "available" ? "Disponible: la próxima llamada entra en unos segundos" : "Ocupado"}</b>.
          </span>
          <button className="primary-button" onClick={() => softphone.closeWrapup()}>
            {wrapup.loading ? "Cerrar sin esperar" : "Continuar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
