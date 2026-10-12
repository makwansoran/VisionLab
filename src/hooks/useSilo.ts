import { useEffect, useState, useSyncExternalStore } from "react";
import type { BridgeStatus } from "../analyse/silo-bridge";
import { bridgeStatus, getSiloStore, subscribeBridgeStatus } from "../analyse/source";
import type { Alert, LoggedEvent } from "../analyse/types";

export function useSiloData(): { events: readonly LoggedEvent[]; alerts: readonly Alert[] } {
  const store = getSiloStore();
  const events = useSyncExternalStore(store.subscribe, store.events);
  const alerts = useSyncExternalStore(store.subscribe, store.alerts);
  return { events, alerts };
}

// A clock that re-renders every intervalMs, for durations and rolling periods.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);

  return now;
}

// Null until the bridge exists, and always null without a Supabase project.
export function useBridgeStatus(): BridgeStatus | null {
  return useSyncExternalStore(subscribeBridgeStatus, bridgeStatus);
}
