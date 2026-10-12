export type FeedEventKind = "empty" | "full" | "alert" | "radio" | "camera" | "capture";

export type FeedEvent = {
  id: string;
  cameraId: string;
  kind: FeedEventKind;
  at: string;
  text: string;
  seen: boolean;
};

export const EVENT_KINDS: readonly FeedEventKind[] = ["empty", "full", "alert", "radio", "camera", "capture"];

export const EVENT_NAMES: Record<FeedEventKind, string> = {
  empty: "Silo empty",
  full: "Silo full",
  alert: "Alert raised",
  radio: "Radio message sent",
  camera: "Camera",
  capture: "Frame captured",
};

// The same colours the Analyse tab uses for the same things, so the two screens agree.
export const EVENT_COLORS: Record<FeedEventKind, string> = {
  empty: "#e85d5d",
  full: "#3a8a9c",
  alert: "#f0a020",
  radio: "#7eb6ff",
  camera: "#a8b0bb",
  capture: "#8fd19e",
};

const storageKey = "visionlab.feed-events";
const keepMs = 24 * 60 * 60 * 1000;

let events: readonly FeedEvent[] | null = null;
const listeners = new Set<() => void>();

function isEvent(value: unknown): value is FeedEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<FeedEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.cameraId === "string" &&
    EVENT_KINDS.some((kind) => kind === event.kind) &&
    typeof event.at === "string" &&
    !Number.isNaN(Date.parse(event.at)) &&
    typeof event.text === "string" &&
    typeof event.seen === "boolean"
  );
}

function load(now: number): FeedEvent[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEvent).filter((event) => Date.parse(event.at) >= now - keepMs);
  } catch {
    return [];
  }
}

function all(): readonly FeedEvent[] {
  if (!events) events = load(Date.now());
  return events;
}

function commit(next: readonly FeedEvent[]) {
  events = next;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // No storage or quota: the log lives in memory until the app restarts.
  }
  for (const listener of listeners) listener();
}

export function feedEvents(): readonly FeedEvent[] {
  return all();
}

export function addFeedEvent(cameraId: string, kind: FeedEventKind, text = EVENT_NAMES[kind], at = new Date().toISOString()): FeedEvent {
  const event: FeedEvent = { id: crypto.randomUUID(), cameraId, kind, at, text, seen: false };
  const cutoff = Date.parse(at) - keepMs;
  commit([...all().filter((item) => Date.parse(item.at) >= cutoff), event]);
  return event;
}

export function markFeedEventsSeen(cameraId: string) {
  if (!all().some((event) => event.cameraId === cameraId && !event.seen)) return;
  commit(all().map((event) => (event.cameraId === cameraId && !event.seen ? { ...event, seen: true } : event)));
}

export function subscribeFeedEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetFeedEvents() {
  events = null;
}
