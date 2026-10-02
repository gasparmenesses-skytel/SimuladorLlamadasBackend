import { useEffect } from "react";
import { ClipboardList, Info, LoaderCircle, Shuffle } from "lucide-react";
import { softphone, type SoftphoneState } from "../softphone/store";
import { CaseCard } from "./CaseCard";
import { Dialpad } from "./Dialpad";
import { Stats } from "./Stats";
import { Transcript } from "./Transcript";

export function OutboundView({ state }: { state: SoftphoneState }) {
  const call = state.call?.direction === "outbound" && state.phase !== "wrapup" ? state.call : null;
  const idle = state.ready && state.phase === "idle";
  // Durante la llamada se muestra el caso de la llamada; antes, el caso cargado para leer.
  const scenario = call?.scenario ?? state.outboundCase;

  // Al entrar a la sección (o al cerrar el informe de una saliente) se carga un caso nuevo.
  const needsCase = idle && !state.outboundCase && state.outboundCaseStatus === "idle";
  useEffect(() => {
    if (needsCase) void softphone.loadOutboundCase();
  }, [needsCase]);

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Llamadas salientes</h2>
          <p className="muted">
            Leé el caso a devolver y, cuando estés listo, marcá el número y tocá <b>Llamar</b>. Atiende el cliente del
            caso.
          </p>
        </div>
      </header>

      <Stats history={state.history} direction="outbound" />

      {state.agentStatus === "available" && state.phase === "idle" && (
        <p className="hint">
          <Info size={16} /> Estás Disponible: puede entrarte una llamada mientras leés el caso. Para hacer salientes con
          calma, ponete en Ocupado.
        </p>
      )}

      <div className="grid-outbound">
        <Dialpad disabled={!idle || !state.outboundCase} onCall={(number) => void softphone.dial(number)} />
        {scenario ? (
          <CaseCard
            scenario={scenario}
            action={
              !call && (
                <button
                  className="ghost-button"
                  onClick={() => void softphone.loadOutboundCase()}
                  disabled={!idle || state.outboundCaseStatus === "loading"}
                  title="Cargar otro caso al azar"
                >
                  <Shuffle size={15} /> Cambiar caso
                </button>
              )
            }
          />
        ) : (
          <section className="card case-empty">
            {state.outboundCaseStatus === "error" ? (
              <>
                <ClipboardList size={34} />
                <h3>No se pudo cargar el caso</h3>
                <button className="primary-button" onClick={() => void softphone.loadOutboundCase()} disabled={!idle}>
                  Reintentar
                </button>
              </>
            ) : (
              <>
                <LoaderCircle size={30} className="spin" />
                <h3>Cargando el caso a devolver…</h3>
              </>
            )}
          </section>
        )}
      </div>

      {call && <Transcript entries={call.transcript} live={state.phase === "active" || state.phase === "held"} />}
    </div>
  );
}
