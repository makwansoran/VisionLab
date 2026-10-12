import type { LoggedEvent } from "./types";

export const RETENTION_DAYS = { events: 365, heartbeats: 7, snapshots: 90 } as const;

const DAY = 86_400_000;

// Drops what is past retention and detaches snapshots past theirs. Never touches anything younger.
export function applyRetention(events: readonly LoggedEvent[], now: number): LoggedEvent[] {
  const out: LoggedEvent[] = [];
  for (const event of events) {
    const age = now - Date.parse(event.at);
    if (age > RETENTION_DAYS.events * DAY) continue;
    if (event.type === "heartbeat" && age > RETENTION_DAYS.heartbeats * DAY) continue;
    out.push(event.snapshot && age > RETENTION_DAYS.snapshots * DAY ? { ...event, snapshot: null } : event);
  }
  return out;
}
