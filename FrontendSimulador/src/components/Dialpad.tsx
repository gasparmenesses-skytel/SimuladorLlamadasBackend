import { useState } from "react";
import { Delete, Phone } from "lucide-react";

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

export function Dialpad({ disabled, onCall }: { disabled: boolean; onCall: (number: string) => void }) {
  const [number, setNumber] = useState("");
  const canCall = !disabled && number.replace(/\D/g, "").length >= 3;

  const press = (key: string) => setNumber((n) => (n + key).slice(0, 20));
  const call = () => {
    if (canCall) onCall(number);
  };

  return (
    <section className="card dialpad">
      <form
        className="dialpad-display"
        onSubmit={(e) => {
          e.preventDefault();
          call();
        }}
      >
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^\d*#+ ]/g, "").slice(0, 20))}
          placeholder="Marcá un número"
          inputMode="tel"
          aria-label="Número a marcar"
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => setNumber((n) => n.slice(0, -1))}
          disabled={!number}
          aria-label="Borrar"
        >
          <Delete size={20} />
        </button>
      </form>
      <div className="dialpad-keys">
        {KEYS.map(([key, letters]) => (
          <button key={key} className="dial-key" onClick={() => press(key)} disabled={disabled}>
            <span>{key}</span>
            <small>{letters}</small>
          </button>
        ))}
      </div>
      <button className="call-button" onClick={call} disabled={!canCall}>
        <Phone size={20} /> Llamar
      </button>
    </section>
  );
}
