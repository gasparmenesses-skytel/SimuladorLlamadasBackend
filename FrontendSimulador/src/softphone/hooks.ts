import { useEffect, useState, useSyncExternalStore } from "react";
import { softphone } from "./store";

export function useSoftphone() {
  return useSyncExternalStore(softphone.subscribe, softphone.getSnapshot);
}

/** Re-renderiza cada `intervalMs` mientras `active` sea true (para los cronómetros). */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
