export type ContainerId = string;
export type DeviceId = string;

export type DetectorState = "empty" | "filled" | "unknown";

// armed, disarmed and app_start are the Pi's own operating states; power is its throttled register.
export type EdgeEventType =
  | "empty"
  | "filled"
  | "unknown"
  | "camera_offline"
  | "camera_online"
  | "heartbeat"
  | "drop"
  | "armed"
  | "disarmed"
  | "app_start"
  | "power";

// Written by the app: every alarm transition is itself an event.
export type AppEventType = "alert_raised" | "alert_cleared" | "alert_acked" | "alert_false" | "voice_sent" | "voice_failed";

export type EventType = EdgeEventType | AppEventType;

export const EDGE_EVENT_TYPES: readonly EdgeEventType[] = [
  "empty",
  "filled",
  "unknown",
  "camera_offline",
  "camera_online",
  "heartbeat",
  "drop",
  "armed",
  "disarmed",
  "app_start",
  "power",
];

export const APP_EVENT_TYPES: readonly AppEventType[] = ["alert_raised", "alert_cleared", "alert_acked", "alert_false", "voice_sent", "voice_failed"];

export const EVENT_TYPES: readonly EventType[] = [...EDGE_EVENT_TYPES, ...APP_EVENT_TYPES];

export type SnapshotRef = {
  // The frame's path in the storage bucket.
  id: string;
  // Null until the path is signed for showing.
  url: string | null;
  width?: number;
  height?: number;
};

export type EventSource = "edge" | "app";

export type LoggedEvent = {
  id: string;
  type: EventType;
  source: EventSource;
  containerId: ContainerId;
  deviceId: DeviceId | null;
  // When it happened, by the Pi's clock for edge events.
  at: string;
  // When the app recorded it. The gap shows clock skew and buffering.
  receivedAt: string;
  seq: number | null;
  state: DetectorState | null;
  confidence: number | null;
  fillScore: number | null;
  snapshot: SnapshotRef | null;
  // Set on alert_* and voice_* events.
  alertId: string | null;
  payload: Record<string, unknown>;
};

export type AlertKind = "empty" | "camera_offline";

// Ground truth next to the detector's confidence, for precision and retraining.
export type DetectionLabel = {
  value: "empty" | "not_empty";
  // An operator marking false is a strong label; a refill after the alarm is a weak one.
  source: "operator_false" | "refill";
  at: string;
  note: string | null;
  by: string | null;
};

// One incident. Raised once, cleared once.
export type Alert = {
  id: string;
  kind: AlertKind;
  containerId: ContainerId;
  // When the condition began: empty since, or camera down since.
  startedAt: string;
  // When the alarm fired, after the delay.
  raisedAt: string;
  clearedAt: string | null;
  raisedEventId: string | null;
  snapshot: SnapshotRef | null;
  confidence: number | null;
  fillScore: number | null;
  // The operator has seen it. Changes nothing on the Pi.
  ackedAt: string | null;
  ackedBy: string | null;
  label: DetectionLabel | null;
};

export type Container = {
  id: ContainerId;
  name: string;
  location: string;
};
