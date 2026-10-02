import { PhoneIncoming, ShieldCheck, UserRound } from "lucide-react";
import { softphone, type SoftphoneState } from "../softphone/store";
import { initials } from "../util";
import { Stats } from "./Stats";
import { Transcript } from "./Transcript";

const TIPS = [
  "Saludá, presentate y nombrá al banco.",
  "Escuchá el motivo completo antes de responder.",
  "Verificá la identidad antes de dar o modificar información.",
  "Nunca pidas PIN, código de seguridad ni claves.",
  "Si ponés en espera, avisá antes y agradecé al volver.",
  "Cerrá resumiendo los próximos pasos.",
];

export function InboundView({ state }: { state: SoftphoneState }) {
  const call = state.call?.direction === "inbound" && state.phase !== "wrapup" ? state.call : null;
  const customer = call?.scenario?.customer;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h2>Llamadas entrantes</h2>
          <p className="muted">
            Ponete <b>Disponible</b> y las llamadas entran solas: suenan unos segundos y se atienden automáticamente.
            Atendé vos primero.
          </p>
        </div>
      </header>

      <Stats history={state.history} direction="inbound" />

      {call ? (
        <div className="grid-2">
          <section className="card crm">
            <header className="card-head">
              <UserRound size={18} />
              <h3>Cliente en línea</h3>
            </header>
            {customer ? (
              <div className="crm-body">
                <span className="crm-avatar">{initials(customer.name)}</span>
                <div className="crm-fields">
                  <div>
                    <small>Nombre</small>
                    <strong>{customer.name}</strong>
                  </div>
                  <div>
                    <small>Teléfono</small>
                    <strong>{customer.phone}</strong>
                  </div>
                  <div>
                    <small>Edad</small>
                    <strong>{customer.age} años</strong>
                  </div>
                  <div>
                    <small>Motivo</small>
                    <strong className="muted">A descubrir en la llamada</strong>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted small">Identificando al cliente…</p>
            )}
            <div className="tips">
              <small>
                <ShieldCheck size={14} /> Buenas prácticas
              </small>
              <ul className="checklist">
                {TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </section>
          <Transcript entries={call.transcript} live={state.phase === "active" || state.phase === "held"} />
        </div>
      ) : (
        <section className="card queue">
          <PhoneIncoming size={34} className="queue-icon" />
          {state.agentStatus === "available" ? (
            <>
              <h3>
                Esperando la próxima llamada<span className="dots" />
              </h3>
              <p className="muted">Cola: Atención general · Banca personas</p>
            </>
          ) : (
            <>
              <h3>Estás Ocupado</h3>
              <p className="muted">No vas a recibir llamadas hasta que te pongas Disponible.</p>
              <button
                className="primary-button"
                disabled={!state.ready || state.phase !== "idle"}
                onClick={() => void softphone.setAgentStatus("available")}
              >
                <span className="led led-green" /> Ponerme disponible
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
