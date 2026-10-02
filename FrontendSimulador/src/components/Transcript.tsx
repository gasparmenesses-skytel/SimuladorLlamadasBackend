import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, MessageSquareText } from "lucide-react";
import type { TranscriptEntry } from "../softphone/store";

export function Transcript({ entries, live }: { entries: TranscriptEntry[]; live: boolean }) {
  const [hidden, setHidden] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries]);

  return (
    <section className="card transcript">
      <header className="card-head">
        <MessageSquareText size={18} />
        <h3>Transcripción {live && <span className="live-tag">en vivo</span>}</h3>
        <button className="ghost-button" onClick={() => setHidden((v) => !v)}>
          {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
          {hidden ? "Mostrar" : "Ocultar"}
        </button>
      </header>
      {hidden ? (
        <p className="muted small">Transcripción oculta, como en una llamada real.</p>
      ) : (
        <div className="transcript-list" ref={listRef}>
          {entries.length === 0 && <p className="muted small">Lo que se diga en la llamada aparece acá.</p>}
          {entries.map((entry) => (
            <div key={entry.id} className={`bubble bubble-${entry.speaker}`}>
              <b>{entry.speaker === "operador" ? "Vos" : "Cliente"}</b>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
