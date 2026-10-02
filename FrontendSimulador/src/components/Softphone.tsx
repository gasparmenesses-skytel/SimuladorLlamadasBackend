import { Headset, Pause, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, Play } from "lucide-react";
import { useNow } from "../softphone/hooks";
import { softphone, type SoftphoneState } from "../softphone/store";
import { formatDuration, initials } from "../util";
import { LevelMeter } from "./LevelMeter";
import { presence } from "./StatusSelector";

export function Softphone({ state }: { state: SoftphoneState }) {
  const { phase, call } = state;
  const inCall = phase === "active" || phase === "held";
  const now = useNow(phase !== "idle" && phase !== "wrapup");
  const { led, blink } = presence(state);

  const customer = call?.scenario?.customer;
  const talkSeconds = call?.answeredAt ? (now - call.answeredAt) / 1000 : 0;
  const holdSeconds = call?.holdStartedAt ? (now - call.holdStartedAt) / 1000 : 0;
  const ringSeconds = call && !call.answeredAt ? (now - call.startedAt) / 1000 : 0;

  return (
    <aside className="softphone" aria-label="Teléfono">
      <div className="phone-head">
        <Headset size={18} />
        <strong>Teléfono</strong>
        <span className="phone-line">
          <span className={`led led-${led} ${blink ? "led-blink" : ""}`} /> Línea 1
        </span>
      </div>

      <div className={`phone-screen phase-${phase}`}>
        {phase === "idle" && state.agentStatus === "available" && (
          <div className="screen-idle">
            <span className="led big-led led-green led-blink" />
            <strong>Esperando llamadas</strong>
            <small>Las llamadas entrantes se atienden solas.</small>
          </div>
        )}
        {phase === "idle" && state.agentStatus === "busy" && (
          <div className="screen-idle">
            <span className="led big-led led-red led-blink" />
            <strong>Ocupado</strong>
            <small>Ponete Disponible para recibir llamadas o marcá una saliente.</small>
          </div>
        )}

        {(phase === "ringing" || phase === "dialing") && (
          <div className="screen-ringing">
            <div className={`ring-icon ${phase === "ringing" ? "ring-shake" : ""}`}>
              {phase === "ringing" ? <PhoneIncoming size={34} /> : <PhoneOutgoing size={34} />}
            </div>
            <strong>{phase === "ringing" ? "Llamada entrante" : "Llamando…"}</strong>
            <span className="screen-name">{customer?.name ?? (phase === "ringing" ? "Identificando…" : call?.dialedNumber)}</span>
            <span className="screen-number">
              {phase === "ringing" ? customer?.phone ?? "" : call?.dialedNumber ?? ""}
            </span>
            <small>
              {phase === "ringing" ? "Se atiende automáticamente" : "Esperando que atienda"} · {formatDuration(ringSeconds)}
            </small>
          </div>
        )}

        {inCall && call && (
          <div className="screen-call">
            <div className="screen-caller">
              <span className="caller-avatar">{customer ? initials(customer.name) : <Phone size={20} />}</span>
              <div>
                <strong>{customer?.name ?? "Cliente"}</strong>
                <span>{call.direction === "outbound" ? call.dialedNumber || customer?.phone : customer?.phone}</span>
              </div>
              <span className={`direction-badge ${call.direction}`}>
                {call.direction === "inbound" ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
                {call.direction === "inbound" ? "Entrante" : "Saliente"}
              </span>
            </div>
            <div className="call-timer" aria-live="off">
              {formatDuration(talkSeconds)}
            </div>
            {phase === "active" ? (
              <div className="call-live">
                <span className="led led-green" /> Llamada activa — ya podés hablar
              </div>
            ) : (
              <div className="call-hold">
                <Pause size={14} /> Cliente en espera · {formatDuration(holdSeconds)}
              </div>
            )}
          </div>
        )}

        {phase === "wrapup" && (
          <div className="screen-idle">
            <PhoneOff size={30} />
            <strong>Llamada finalizada</strong>
            <small>Revisá el informe para continuar.</small>
          </div>
        )}
      </div>

      <div className="phone-levels">
        <LevelMeter who="operador" active={inCall} />
        <LevelMeter who="cliente" active={inCall} />
      </div>

      <div className="phone-actions">
        <button
          className={`phone-button hold ${phase === "held" ? "on" : ""}`}
          disabled={!inCall}
          onClick={() => softphone.toggleHold()}
        >
          {phase === "held" ? <Play size={22} /> : <Pause size={22} />}
          <span>{phase === "held" ? "Retomar" : "Espera"}</span>
        </button>
        <button
          className="phone-button hangup"
          disabled={!(inCall || phase === "ringing" || phase === "dialing")}
          onClick={() => softphone.hangup()}
        >
          <PhoneOff size={22} />
          <span>{phase === "ringing" ? "Rechazar" : phase === "dialing" ? "Cancelar" : "Cortar"}</span>
        </button>
      </div>

      <p className="phone-foot">Usá auriculares: con parlantes el cliente se escucha a sí mismo.</p>
    </aside>
  );
}
