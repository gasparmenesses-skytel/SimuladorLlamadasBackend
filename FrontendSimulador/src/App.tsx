import { useEffect, useState } from "react";
import { TriangleAlert, Info, X } from "lucide-react";
import { HistoryView } from "./components/HistoryView";
import { InboundView } from "./components/InboundView";
import { OutboundView } from "./components/OutboundView";
import { SideNav, type Tab } from "./components/SideNav";
import { Softphone } from "./components/Softphone";
import { TopBar } from "./components/TopBar";
import { WrapupModal } from "./components/WrapupModal";
import { useSoftphone } from "./softphone/hooks";
import { softphone } from "./softphone/store";

export function App() {
  const state = useSoftphone();
  const [tab, setTab] = useState<Tab>("inbound");

  // Cuando empieza una llamada, se muestra la sección que le corresponde.
  const startingDirection = state.phase === "ringing" || state.phase === "dialing" ? state.call?.direction : undefined;
  useEffect(() => {
    if (startingDirection) setTab(startingDirection);
  }, [startingDirection]);

  return (
    <div className="app">
      <TopBar state={state} />
      <div className="workspace">
        <SideNav tab={tab} onChange={setTab} state={state} />
        <main className="content">
          {state.notice && (
            <div className={`notice notice-${state.notice.kind}`} role="alert">
              {state.notice.kind === "error" ? <TriangleAlert size={18} /> : <Info size={18} />}
              <span>{state.notice.text}</span>
              <button className="icon-button" onClick={() => softphone.dismissNotice()} aria-label="Cerrar aviso">
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "inbound" && <InboundView state={state} />}
          {tab === "outbound" && <OutboundView state={state} />}
          {tab === "history" && <HistoryView state={state} />}
        </main>
        <Softphone state={state} />
      </div>
      {state.phase === "wrapup" && state.wrapup && <WrapupModal wrapup={state.wrapup} agentStatus={state.agentStatus} />}
    </div>
  );
}
