import { inPeriod, startOfDay, type Period } from "./periods";
import type { Alert, AlertKind, LoggedEvent } from "./types";

export type StateKind = "empty" | "camera" | "disarmed" | "nocontact";

export type StateInterval = {
  kind: StateKind;
  from: number;
  to: number;
  // Set for alarm intervals, so a segment can name its alarm.
  alertId?: string;
  // True when the interval was still running at the period end.
  ongoing: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// The Pi reports every five minutes. Three missed in a row means no contact.
export const CONTACT_GAP_MS = 15 * MINUTE;

export function todayPeriod(now: number): Period {
  return { from: startOfDay(now), to: now + 1 };
}

// One bucket per hour of today, the current hour ending now.
export function hourBuckets(now: number): Period[] {
  const start = startOfDay(now);
  const out: Period[] = [];
  for (let h = 0; h < 24; h += 1) {
    const from = start + h * HOUR;
    if (from > now) break;
    out.push({ from, to: Math.min(from + HOUR, now + 1) });
  }
  return out;
}

// Alarm intervals of one kind, clipped to the period. Open alarms run to the period end.
export function alarmIntervals(alerts: readonly Alert[], kind: AlertKind, period: Period): StateInterval[] {
  const out: StateInterval[] = [];
  for (const alert of alerts) {
    if (alert.kind !== kind) continue;
    const from = Date.parse(alert.raisedAt);
    const end = alert.clearedAt ? Date.parse(alert.clearedAt) : null;
    const to = end ?? period.to;
    if (to <= period.from || from >= period.to) continue;
    out.push({
      kind: kind === "empty" ? "empty" : "camera",
      from: Math.max(from, period.from),
      to: Math.min(to, period.to),
      alertId: alert.id,
      ongoing: end === null || end >= period.to,
    });
  }
  return out.sort((a, b) => a.from - b.from);
}

// From a disarmed row until the next sign of an armed Pi. An empty or full row only ever comes from
// an armed Pi, and a restart keeps whatever state the Pi had.
export function disarmedIntervals(events: readonly LoggedEvent[], period: Period): StateInterval[] {
  const marks = events
    .filter((event) => event.type === "armed" || event.type === "disarmed" || event.type === "empty" || event.type === "filled")
    .map((event) => ({ at: Date.parse(event.at), off: event.type === "disarmed" }))
    .sort((a, b) => a.at - b.at);
  const out: StateInterval[] = [];
  let offSince: number | null = null;
  for (const mark of marks) {
    if (mark.off) {
      if (offSince === null) offSince = mark.at;
    } else if (offSince !== null) {
      push(out, "disarmed", offSince, mark.at, period, false);
      offSince = null;
    }
  }
  if (offSince !== null) push(out, "disarmed", offSince, period.to, period, true);
  return out;
}

// Stretches where nothing arrived from the Pi: from its last message to the next one, or to now.
export function contactGaps(events: readonly LoggedEvent[], period: Period, now: number, maxGapMs = CONTACT_GAP_MS): StateInterval[] {
  const times = edgeTimes(events);
  const out: StateInterval[] = [];
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] > maxGapMs) push(out, "nocontact", times[i - 1], times[i], period, false);
  }
  const last = times[times.length - 1];
  if (last !== undefined && now - last > maxGapMs) push(out, "nocontact", last, now, period, true);
  return out;
}

function push(out: StateInterval[], kind: StateKind, from: number, to: number, period: Period, ongoing: boolean) {
  if (to <= period.from || from >= period.to) return;
  out.push({ kind, from: Math.max(from, period.from), to: Math.min(to, period.to), ongoing });
}

function edgeTimes(events: readonly LoggedEvent[]): number[] {
  return events
    .filter((event) => event.source === "edge")
    .map((event) => Date.parse(event.at))
    .sort((a, b) => a - b);
}

// Time the silo spent in alarm inside the period, total and longest single stretch.
export function emptyTime(alerts: readonly Alert[], period: Period): { totalMs: number; longestMs: number } {
  let totalMs = 0;
  let longestMs = 0;
  for (const interval of alarmIntervals(alerts, "empty", period)) {
    const ms = interval.to - interval.from;
    totalMs += ms;
    longestMs = Math.max(longestMs, ms);
  }
  return { totalMs, longestMs };
}

// How long the silo stayed empty before it was filled: the typical case, over the alarms raised in the period that have ended.
export function responseTime(alerts: readonly Alert[], period: Period): { medianMs: number | null; count: number } {
  const durations = alerts
    .filter((alert) => alert.kind === "empty" && alert.clearedAt && inPeriod(alert.raisedAt, period))
    .map((alert) => Date.parse(alert.clearedAt as string) - Date.parse(alert.raisedAt))
    .sort((a, b) => a - b);
  if (durations.length === 0) return { medianMs: null, count: 0 };
  const mid = Math.floor(durations.length / 2);
  const medianMs = durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  return { medianMs, count: durations.length };
}

// Voice messages that belonged to an alarm. Radio tests from the Pi's own screen have no alarm and are not counted.
export function voiceCounts(events: readonly LoggedEvent[], period: Period): { sent: number; failed: number } {
  let sent = 0;
  let failed = 0;
  for (const event of events) {
    if (event.alertId === null || !inPeriod(event.at, period)) continue;
    if (event.type === "voice_sent") sent += 1;
    else if (event.type === "voice_failed") failed += 1;
  }
  return { sent, failed };
}

// Empty alarms raised in each bucket, by the time they were raised.
export function alarmsPerBucket(alerts: readonly Alert[], buckets: readonly Period[]): number[] {
  return buckets.map((bucket) => alerts.filter((alert) => alert.kind === "empty" && inPeriod(alert.raisedAt, bucket)).length);
}

export function emptyMsPerBucket(alerts: readonly Alert[], buckets: readonly Period[]): number[] {
  return buckets.map((bucket) => emptyTime(alerts, bucket).totalMs);
}

export type Coverage = {
  // 0 to 1 of the time since the Pi first reported, or null when it never has.
  share: number | null;
  noContactMs: number;
  // Camera down while the Pi was talking.
  cameraDownMs: number;
  // Monitoring switched off while the Pi was talking and the camera was up.
  disarmedMs: number;
};

// Watched means the Pi was talking, the camera was up and monitoring was on. The three reasons are
// taken out in that order, so an hour of silence is not also counted as an hour without camera.
export function coverage(events: readonly LoggedEvent[], alerts: readonly Alert[], period: Period, now: number): Coverage {
  const times = edgeTimes(events);
  const from = times.length > 0 ? Math.max(period.from, times[0]) : null;
  const to = Math.min(period.to, now + 1);
  if (from === null || to <= from) return { share: null, noContactMs: 0, cameraDownMs: 0, disarmedMs: 0 };
  const range = { from, to };
  const silence = merge(spans(contactGaps(events, range, now)));
  const camera = subtract(merge(spans(alarmIntervals(alerts, "camera_offline", range))), silence);
  const off = subtract(merge(spans(disarmedIntervals(events, range))), merge([...silence, ...camera]));
  const noContactMs = total(silence);
  const cameraDownMs = total(camera);
  const disarmedMs = total(off);
  return { share: Math.max(0, 1 - (noContactMs + cameraDownMs + disarmedMs) / (to - from)), noContactMs, cameraDownMs, disarmedMs };
}

type Span = [number, number];

function spans(intervals: readonly StateInterval[]): Span[] {
  return intervals.map((interval): Span => [interval.from, interval.to]);
}

function merge(list: readonly Span[]): Span[] {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

// What is left of list once cut is taken out. Both merged.
function subtract(list: readonly Span[], cut: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const [from, to] of list) {
    let start = from;
    for (const [cutFrom, cutTo] of cut) {
      if (cutTo <= start || cutFrom >= to) continue;
      if (cutFrom > start) out.push([start, cutFrom]);
      start = Math.max(start, cutTo);
    }
    if (start < to) out.push([start, to]);
  }
  return out;
}

function total(list: readonly Span[]): number {
  return list.reduce((sum, [from, to]) => sum + (to - from), 0);
}

// The newest empty alarms raised in the period.
export function recentAlarms(alerts: readonly Alert[], period: Period, limit: number): Alert[] {
  return alerts
    .filter((alert) => alert.kind === "empty" && inPeriod(alert.raisedAt, period))
    .sort((a, b) => Date.parse(b.raisedAt) - Date.parse(a.raisedAt))
    .slice(0, limit);
}

// Whether the voice reached the floor for one alarm: sent, failed, or nothing logged.
export function voiceOutcome(events: readonly LoggedEvent[], alertId: string): "sent" | "failed" | "none" {
  let failed = false;
  for (const event of events) {
    if (event.alertId !== alertId) continue;
    if (event.type === "voice_sent") return "sent";
    if (event.type === "voice_failed") failed = true;
  }
  return failed ? "failed" : "none";
}

export type PowerReason = "undervoltage" | "heat" | "throttled" | "other";

export function powerReason(throttled: number): PowerReason {
  // Low bits are now, bits 16 up are since boot: 0 and 16 under-voltage, 3 and 19 heat, 1, 2, 17, 18 slowed down.
  if (throttled & 0x10001) return "undervoltage";
  if (throttled & 0x80008) return "heat";
  if (throttled & 0x60006) return "throttled";
  return "other";
}

export type SiloStatus = {
  silo: "empty" | "full" | "unknown";
  // When the silo entered that state, or when we lost sight of it.
  siloSince: number | null;
  // The last message from the Pi, and whether that is recent enough to trust.
  lastContactAt: number | null;
  contact: boolean;
  monitoring: "on" | "off" | "unknown";
  // False when the Pi has no reference photos and so cannot alarm at all. Null when it never said.
  ready: boolean | null;
  cameraDownSince: number | null;
  power: { ok: boolean; throttled: number; at: number } | null;
  radio: { sentAt: number | null; failedAt: number | null };
};

export function currentStatus(events: readonly LoggedEvent[], alerts: readonly Alert[], now: number): SiloStatus {
  const edge = events.filter((event) => event.source === "edge").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lastContactAt = edge.length > 0 ? Date.parse(edge[edge.length - 1].at) : null;
  const contact = lastContactAt !== null && now - lastContactAt <= CONTACT_GAP_MS;
  const openEmpty = alerts.find((alert) => alert.kind === "empty" && !alert.clearedAt) ?? null;
  const openCamera = alerts.find((alert) => alert.kind === "camera_offline" && !alert.clearedAt) ?? null;

  // An open alarm wins. Otherwise the last verdict, as long as the Pi still talks and can see.
  let silo: SiloStatus["silo"] = "unknown";
  let siloSince: number | null = lastContactAt;
  if (openEmpty) {
    silo = "empty";
    siloSince = Date.parse(openEmpty.raisedAt);
  } else if (openCamera) {
    siloSince = Date.parse(openCamera.startedAt);
  } else if (contact) {
    const last = lastWithState(edge);
    if (last) {
      silo = last.state === "empty" ? "empty" : "full";
      // Full since the refill that ended the last alarm, or since the verdicts turned, whichever is later.
      const refilled = alerts.filter((alert) => alert.kind === "empty" && alert.clearedAt).map((alert) => Date.parse(alert.clearedAt as string));
      siloSince = Math.max(runStart(edge, last.state), ...refilled);
    }
  }

  const mark = [...edge].reverse().find((event) => event.type === "armed" || event.type === "disarmed" || event.type === "empty" || event.type === "filled");
  const monitoring: SiloStatus["monitoring"] = !contact || !mark ? "unknown" : mark.type === "disarmed" ? "off" : "on";

  const heartbeat = [...edge].reverse().find((event) => event.type === "heartbeat");
  const labels = heartbeat?.payload.labelsEmpty;
  const ready = typeof labels === "number" ? labels > 0 : null;

  const power = [...edge].reverse().find((event) => event.type === "power");
  const throttled = typeof power?.payload.throttled === "number" ? power.payload.throttled : 0;

  const sent = [...events].reverse().find((event) => event.type === "voice_sent");
  const failed = [...events].reverse().find((event) => event.type === "voice_failed");

  return {
    silo,
    siloSince,
    lastContactAt,
    contact,
    monitoring,
    ready,
    cameraDownSince: openCamera ? Date.parse(openCamera.startedAt) : null,
    power: power ? { ok: throttled === 0, throttled, at: Date.parse(power.at) } : null,
    radio: { sentAt: sent ? Date.parse(sent.at) : null, failedAt: failed ? Date.parse(failed.at) : null },
  };
}

function lastWithState(edge: readonly LoggedEvent[]): (LoggedEvent & { state: "empty" | "filled" }) | null {
  for (let i = edge.length - 1; i >= 0; i -= 1) {
    const state = edge[i].state;
    if (state === "empty" || state === "filled") return edge[i] as LoggedEvent & { state: "empty" | "filled" };
  }
  return null;
}

// When the current run of a state began: the first of the trailing events that say it.
function runStart(edge: readonly LoggedEvent[], state: "empty" | "filled"): number {
  let start = edge[edge.length - 1];
  for (let i = edge.length - 1; i >= 0; i -= 1) {
    const seen = edge[i].state;
    if (seen === null) continue;
    if (seen !== state) break;
    start = edge[i];
  }
  return Date.parse(start.at);
}

export type StoryItem = {
  kind: "empty" | "camera" | "nocontact" | "power" | "restart" | "armed" | "disarmed" | "voiceTest";
  at: number;
  // When it ended, for the kinds that last. Null while it goes on.
  to: number | null;
  ongoing: boolean;
  voice?: "sent" | "failed" | "none";
  throttled?: number;
  // Restarts close together are one line.
  count?: number;
  ok?: boolean;
};

// Everything a reader should know about the period, newest first: alarms, outages, silence, power, restarts, switches, radio tests.
export function storyline(events: readonly LoggedEvent[], alerts: readonly Alert[], period: Period, now: number): StoryItem[] {
  const items: StoryItem[] = [];
  const overlaps = (from: number, to: number | null) => (to ?? now) > period.from && from < period.to;

  for (const alert of alerts) {
    const at = Date.parse(alert.raisedAt);
    const to = alert.clearedAt ? Date.parse(alert.clearedAt) : null;
    if (!overlaps(at, to)) continue;
    if (alert.kind === "empty") items.push({ kind: "empty", at, to, ongoing: to === null, voice: voiceOutcome(events, alert.id) });
    else items.push({ kind: "camera", at, to, ongoing: to === null });
  }

  for (const gap of contactGaps(events, { from: 0, to: now + 1 }, now)) {
    if (overlaps(gap.from, gap.ongoing ? null : gap.to)) items.push({ kind: "nocontact", at: gap.from, to: gap.ongoing ? null : gap.to, ongoing: gap.ongoing });
  }

  const inside = events.filter((event) => inPeriod(event.at, period)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let restart: StoryItem | null = null;
  let lastRestartAt = 0;
  for (const event of inside) {
    const at = Date.parse(event.at);
    switch (event.type) {
      case "power": {
        const throttled = typeof event.payload.throttled === "number" ? event.payload.throttled : 0;
        if (throttled !== 0) items.push({ kind: "power", at, to: null, ongoing: false, throttled });
        break;
      }
      case "app_start":
        if (restart && at - lastRestartAt <= CONTACT_GAP_MS) {
          restart.count = (restart.count ?? 1) + 1;
        } else {
          restart = { kind: "restart", at, to: null, ongoing: false, count: 1 };
          items.push(restart);
        }
        lastRestartAt = at;
        break;
      case "armed":
      case "disarmed":
        items.push({ kind: event.type, at, to: null, ongoing: false });
        break;
      case "voice_sent":
      case "voice_failed":
        if (event.alertId === null) items.push({ kind: "voiceTest", at, to: null, ongoing: false, ok: event.type === "voice_sent" });
        break;
      default:
        break;
    }
  }

  return items.sort((a, b) => b.at - a.at);
}

// The chips above the story. An empty alarm belongs to the silo and, through its voice message, to the radio.
export type StoryCategory = "silo" | "camera" | "pi" | "radio";

export function storyCategories(item: StoryItem): StoryCategory[] {
  switch (item.kind) {
    case "empty":
      return ["silo", "radio"];
    case "camera":
      return ["camera"];
    case "voiceTest":
      return ["radio"];
    default:
      return ["pi"];
  }
}
