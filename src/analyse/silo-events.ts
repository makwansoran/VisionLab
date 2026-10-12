import { newId } from "./store";
import type { Alert, AlertKind, ContainerId, DetectorState, EventType, LoggedEvent, SnapshotRef } from "./types";

// The Pi writes one table per fact and decides the alarms itself; the app only mirrors what it wrote.
// silo_empty, silo_full and the radio tables are kept for good; the rest is about the Pi and is deleted after 30 days.
export const SILO_TABLES = [
  "silo_empty",
  "silo_full",
  "silo_heartbeat",
  "silo_power",
  "silo_camera_down",
  "silo_camera_up",
  "silo_radio_tx",
  "silo_radio_fail",
  "silo_app_start",
  "silo_armed",
  "silo_disarmed",
] as const;

export type SiloTable = (typeof SILO_TABLES)[number];

// One row from any of the tables. Only id, site_id and ts exist in all of them.
export type SiloRow = {
  id: number;
  site_id: string;
  ts: string;
  created_at?: string;
  empty?: boolean | null;
  confidence?: number | null;
  checks?: number | null;
  empty_hits?: number | null;
  alerts_sent?: number | null;
  labels_empty?: number | null;
  labels_full?: number | null;
  // silo_power: the Pi's throttled register. 0 means the power has been fine.
  throttled?: number | null;
};

export type SiloFact = { table: SiloTable; row: SiloRow };

// From this day the Pi writes a silo_full row when the silo is full again. Before it, a heartbeat was the only sign.
export const FULL_ROWS_SINCE = Date.parse("2026-10-01T00:00:00Z");

// The Storage bucket the Pi uploads stills to. Private; the app signs URLs when it shows them.
export const FRAME_BUCKET = "silo-frames";

// Where the Pi puts the frame for an alarm. The alarm's ts is whole seconds.
export function alertFramePath(siteId: string, ts: string): string {
  return `${siteId}/alerts/${Math.floor(Date.parse(ts) / 1000)}.jpg`;
}

export function latestFramePath(siteId: string): string {
  return `${siteId}/latest.jpg`;
}

export type MirrorOptions = {
  containerForSite: (siteId: string) => ContainerId | null;
  // The open alarm of this kind on this container, if any. Seeded from the store.
  activeAlert: (containerId: ContainerId, kind: AlertKind) => Alert | null;
  now?: () => number;
  newId?: () => string;
};

export type Mirrored = {
  events: LoggedEvent[];
  // New and changed alarms, to be saved.
  alerts: Alert[];
  // The highest row id seen per table, including rows that were skipped.
  lastRowIds: Partial<Record<SiloTable, number>>;
};

// Facts from the same second fold in this order, so an alarm exists before its radio message and its refill.
const SAME_SECOND_ORDER: readonly SiloTable[] = [
  "silo_app_start",
  "silo_armed",
  "silo_disarmed",
  "silo_camera_down",
  "silo_camera_up",
  "silo_heartbeat",
  "silo_power",
  "silo_empty",
  "silo_radio_tx",
  "silo_radio_fail",
  "silo_full",
];

// Facts are folded in time order whatever table they came from, so a batch fetched after an outage replays correctly.
export function mirrorSiloFacts(facts: readonly SiloFact[], options: MirrorOptions): Mirrored {
  const now = options.now ?? (() => Date.now());
  const nextId = options.newId ?? newId;
  const events: LoggedEvent[] = [];
  const changed = new Map<string, Alert>();
  // Working copy of the open alarms, so facts in the same batch see each other.
  const open = new Map<string, Alert | null>();
  const lastRowIds: Partial<Record<SiloTable, number>> = {};

  function openAlert(containerId: ContainerId, kind: AlertKind): Alert | null {
    const key = `${containerId}:${kind}`;
    if (!open.has(key)) open.set(key, options.activeAlert(containerId, kind));
    return open.get(key) ?? null;
  }

  function setOpen(containerId: ContainerId, kind: AlertKind, alert: Alert | null) {
    open.set(`${containerId}:${kind}`, alert);
    if (alert) changed.set(alert.id, alert);
  }

  function log(fact: SiloFact, containerId: ContainerId, type: EventType, extra: Partial<LoggedEvent> = {}): LoggedEvent {
    const event: LoggedEvent = {
      id: nextId(),
      type,
      source: "edge",
      containerId,
      deviceId: fact.row.site_id,
      at: fact.row.ts,
      receivedAt: new Date(now()).toISOString(),
      seq: fact.row.id,
      state: null,
      confidence: null,
      fillScore: null,
      snapshot: null,
      alertId: null,
      payload: tag(fact),
      ...extra,
    };
    events.push(event);
    return event;
  }

  function raise(fact: SiloFact, containerId: ContainerId, kind: AlertKind, raisedEventId: string | null, snapshot: SnapshotRef | null): Alert {
    const alert: Alert = {
      id: nextId(),
      kind,
      containerId,
      startedAt: fact.row.ts,
      raisedAt: fact.row.ts,
      clearedAt: null,
      raisedEventId,
      snapshot,
      confidence: fact.row.confidence ?? null,
      fillScore: null,
      ackedAt: null,
      ackedBy: null,
      label: null,
    };
    setOpen(containerId, kind, alert);
    log(fact, containerId, "alert_raised", { alertId: alert.id, payload: { ...tag(fact), alertKind: kind } });
    return alert;
  }

  function clear(fact: SiloFact, containerId: ContainerId, current: Alert) {
    const cleared: Alert = { ...current, clearedAt: fact.row.ts };
    setOpen(containerId, current.kind, null);
    changed.set(cleared.id, cleared);
    log(fact, containerId, "alert_cleared", { alertId: cleared.id, payload: { ...tag(fact), alertKind: current.kind } });
  }

  // These rows carry the Pi's own alarm latch. False while we hold an alarm means the Pi has let it go.
  function latchCheck(fact: SiloFact, containerId: ContainerId, empty: boolean | null) {
    const current = openAlert(containerId, "empty");
    if (current && empty === false) clear(fact, containerId, current);
  }

  const sorted = [...facts].sort(
    (a, b) =>
      Date.parse(a.row.ts) - Date.parse(b.row.ts) ||
      SAME_SECOND_ORDER.indexOf(a.table) - SAME_SECOND_ORDER.indexOf(b.table) ||
      a.row.id - b.row.id,
  );

  for (const fact of sorted) {
    const { table, row } = fact;
    lastRowIds[table] = Math.max(lastRowIds[table] ?? 0, row.id);
    const containerId = options.containerForSite(row.site_id);
    if (!containerId) continue;

    switch (table) {
      case "silo_empty": {
        const current = openAlert(containerId, "empty");
        // The Pi uploads the frame it saw under this path. The URL is signed when the image is shown.
        const snapshot: SnapshotRef = { id: alertFramePath(row.site_id, row.ts), url: null };
        const seen = log(fact, containerId, "empty", { state: "empty", snapshot, alertId: current?.id ?? null });
        // The Pi announced again while the alarm was still open: one incident, not two.
        if (current) break;
        seen.alertId = raise(fact, containerId, "empty", seen.id, snapshot).id;
        break;
      }
      case "silo_full": {
        const current = openAlert(containerId, "empty");
        if (current) {
          log(fact, containerId, "filled", { state: "filled", confidence: row.confidence ?? null, alertId: current.id });
          clear(fact, containerId, current);
        } else {
          // Once a day while the silo stays full the Pi says so. Not a refill.
          log(fact, containerId, "filled", { state: "filled", confidence: row.confidence ?? null, payload: { ...tag(fact), note: "daily" } });
        }
        break;
      }
      case "silo_heartbeat": {
        const state = stateOf(row.empty ?? null);
        log(fact, containerId, "heartbeat", { state, payload: heartbeatPayload(fact) });
        // Before silo_full existed, a heartbeat saying not empty was the only sign of a refill.
        const current = openAlert(containerId, "empty");
        if (state === "filled" && current && Date.parse(row.ts) < FULL_ROWS_SINCE) {
          log(fact, containerId, "filled", { state: "filled", alertId: current.id });
          clear(fact, containerId, current);
        }
        break;
      }
      case "silo_power":
        log(fact, containerId, "power", { payload: { ...tag(fact), throttled: row.throttled ?? 0 } });
        break;
      case "silo_camera_down": {
        const current = openAlert(containerId, "camera_offline");
        const seen = log(fact, containerId, "camera_offline", { alertId: current?.id ?? null });
        if (current) break;
        seen.alertId = raise(fact, containerId, "camera_offline", seen.id, null).id;
        break;
      }
      case "silo_camera_up": {
        const current = openAlert(containerId, "camera_offline");
        log(fact, containerId, "camera_online", { alertId: current?.id ?? null });
        if (current) clear(fact, containerId, current);
        break;
      }
      case "silo_radio_tx":
      case "silo_radio_fail": {
        // Tied to the open alarm when there is one; otherwise it was a test from the Pi's own screen.
        const current = openAlert(containerId, "empty");
        log(fact, containerId, table === "silo_radio_tx" ? "voice_sent" : "voice_failed", {
          state: stateOf(row.empty ?? null),
          alertId: current?.id ?? null,
        });
        latchCheck(fact, containerId, row.empty ?? null);
        break;
      }
      case "silo_app_start":
      case "silo_armed":
      case "silo_disarmed": {
        log(fact, containerId, table === "silo_app_start" ? "app_start" : table === "silo_armed" ? "armed" : "disarmed", { state: stateOf(row.empty ?? null) });
        latchCheck(fact, containerId, row.empty ?? null);
        break;
      }
      default:
        // A table we do not know yet. Skipped, but lastRowIds still moves on.
        break;
    }
  }

  return { events, alerts: [...changed.values()], lastRowIds };
}

// Where to resume after a restart: the highest row id already mirrored, per table, for these sites.
export function lastRowIdsIn(events: readonly LoggedEvent[], sites: readonly string[]): Partial<Record<SiloTable, number>> {
  const out: Partial<Record<SiloTable, number>> = {};
  for (const event of events) {
    if (event.source !== "edge" || event.seq === null || !event.deviceId || !sites.includes(event.deviceId)) continue;
    const table = event.payload.table;
    if (typeof table !== "string" || !(SILO_TABLES as readonly string[]).includes(table)) continue;
    const key = table as SiloTable;
    out[key] = Math.max(out[key] ?? 0, event.seq);
  }
  return out;
}

// Every mirrored event remembers its table and row, so a restart knows where to continue.
function tag(fact: SiloFact): Record<string, unknown> {
  return { table: fact.table, rowId: fact.row.id };
}

// The Pi's last verdict as a state. Null means it had none, for example with no reference photos.
function stateOf(empty: boolean | null): DetectorState | null {
  if (empty === true) return "empty";
  if (empty === false) return "filled";
  return null;
}

function heartbeatPayload(fact: SiloFact): Record<string, unknown> {
  const row = fact.row;
  return {
    ...tag(fact),
    checks: row.checks ?? null,
    emptyHits: row.empty_hits ?? null,
    alertsSent: row.alerts_sent ?? null,
    labelsEmpty: row.labels_empty ?? null,
    labelsFull: row.labels_full ?? null,
  };
}
