import type { ReactNode } from "react";
import { CircleCheck, CircleMinus, CircleX, LoaderCircle, PhoneIncoming, PhoneOutgoing, Sparkles, Star, TriangleAlert } from "lucide-react";
import type { CriterionStatus, Evaluation, Resolution } from "../api";
import type { WrapUp } from "../softphone/store";
import { formatDuration } from "../util";

const SATISFACTION_LABELS = ["", "Muy insatisfecho", "Insatisfecho", "Neutral", "Satisfecho", "Muy satisfecho"];
const RESOLUTION_LABELS: Record<Resolution, string> = {
  resuelto: "Resuelto",
  parcial: "Parcialmente resuelto",
  no_resuelto: "Sin resolver",
};
const SCORE_LABELS: [keyof Evaluation["scores"], string][] = [
  ["empathy", "Empatía"],
  ["clarity", "Claridad"],
  ["procedure", "Procedimiento"],
  ["security", "Seguridad"],
  ["call_control", "Manejo de la llamada"],
];
const CRITERION_ICONS: Record<CriterionStatus, ReactNode> = {
  cumplido: <CircleCheck size={18} className="ok" />,
  parcial: <CircleMinus size={18} className="warn" />,
  no_cumplido: <CircleX size={18} className="bad" />,
};

export function ReportView({ wrapup }: { wrapup: WrapUp }) {
  const { call, metrics, report, loading, error } = wrapup;
  const scenario = report?.scenario ?? call.scenario;
  const evaluation = report?.evaluation;

  return (
    <div className="report">
      <header className="report-head">
        <span className={`direction-badge ${call.direction}`}>
          {call.direction === "inbound" ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
          {call.direction === "inbound" ? "Entrante" : "Saliente"}
        </span>
        <h2>{scenario?.title ?? "Llamada"}</h2>
        <p className="muted">
          {scenario?.customer.name} · {scenario?.customer.phone}
          {scenario && (
            <>
              {" "}
              · dificultad <b className={`difficulty difficulty-${scenario.difficulty}`}>{scenario.difficulty}</b>
            </>
          )}
          {scenario?.case && <> · caso {scenario.case.number}</>}
        </p>
      </header>

      <div className="tiles">
        <Tile label="Duración" value={formatDuration(metrics.total_seconds)} />
        <Tile label="Conversación" value={formatDuration(metrics.talk_seconds)} />
        <Tile
          label="En espera"
          value={formatDuration(metrics.hold_seconds)}
          hint={`${metrics.hold_count} ${metrics.hold_count === 1 ? "vez" : "veces"}`}
        />
        <Tile label="Timbre" value={`${Math.round(metrics.ring_seconds)} s`} />
        <Tile
          label="Hablaste"
          value={report ? `${Math.round(report.talk.operator_share * 100)} %` : "—"}
          hint="de las palabras"
        />
      </div>

      {loading && (
        <div className="report-loading">
          <LoaderCircle size={22} className="spin" />
          <span>Evaluando la llamada con IA…</span>
        </div>
      )}
      {error && (
        <div className="notice notice-error">
          <TriangleAlert size={18} /> <span>No se pudo generar el informe: {error}</span>
        </div>
      )}
      {report?.evaluation_error && (
        <div className="notice notice-info">
          <TriangleAlert size={18} /> <span>Sin evaluación con IA: {report.evaluation_error}</span>
        </div>
      )}

      {evaluation && (
        <>
          <div className="grid-2">
            <section className="card">
              <small className="label">Satisfacción del cliente (estimada)</small>
              <div className="stars" aria-label={`${evaluation.customer_satisfaction} de 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={24} className={n <= evaluation.customer_satisfaction ? "star-on" : "star-off"} />
                ))}
                <b>{SATISFACTION_LABELS[evaluation.customer_satisfaction]}</b>
              </div>
              <p>{evaluation.satisfaction_reason}</p>
            </section>
            <section className="card">
              <small className="label">Resolución</small>
              <div className={`resolution resolution-${evaluation.resolution}`}>
                {RESOLUTION_LABELS[evaluation.resolution]}
              </div>
              <p>{evaluation.resolution_reason}</p>
            </section>
          </div>

          <section className="card">
            <header className="card-head">
              <Sparkles size={18} />
              <h3>Resumen</h3>
              <span className="score-avg">Puntaje general {average(evaluation).toFixed(1)} / 10</span>
            </header>
            <p>{evaluation.summary}</p>
            <div className="scores">
              {SCORE_LABELS.map(([key, label]) => (
                <div key={key} className="score">
                  <span>{label}</span>
                  <div className="score-bar">
                    <i style={{ width: `${evaluation.scores[key] * 10}%` }} className={scoreClass(evaluation.scores[key])} />
                  </div>
                  <b>{evaluation.scores[key]}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <header className="card-head">
              <h3>Criterios del escenario</h3>
              <span className="muted small">
                {evaluation.criteria.filter((c) => c.status === "cumplido").length} de {evaluation.criteria.length} cumplidos
              </span>
            </header>
            <ul className="criteria">
              {evaluation.criteria.map((c) => (
                <li key={c.criterion}>
                  {CRITERION_ICONS[c.status]}
                  <div>
                    <strong>{c.criterion}</strong>
                    <span>{c.comment}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid-2">
            <section className="card">
              <h3 className="list-title ok">Fortalezas</h3>
              <ul className="plain-list">
                {evaluation.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h3 className="list-title warn">Para mejorar</h3>
              <ul className="plain-list">
                {evaluation.improvements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {call.transcript.length > 0 && (
        <details className="card report-transcript">
          <summary>Transcripción completa</summary>
          {call.transcript.map((entry) => (
            <p key={entry.id}>
              <b className={entry.speaker === "operador" ? "who-op" : "who-cli"}>
                {entry.speaker === "operador" ? "Vos" : "Cliente"}:
              </b>{" "}
              {entry.text}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

const average = (e: Evaluation) => SCORE_LABELS.reduce((sum, [key]) => sum + e.scores[key], 0) / SCORE_LABELS.length;
const scoreClass = (score: number) => (score >= 7 ? "good" : score >= 4 ? "mid" : "low");
