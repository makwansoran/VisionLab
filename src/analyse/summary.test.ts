import { describe, expect, it } from "vitest";
import { dayBuckets, lastDays } from "./periods";
import {
  alarmIntervals,
  alarmsPerBucket,
  contactGaps,
  coverage,
  currentStatus,
  disarmedIntervals,
  emptyTime,
  hourBuckets,
  powerReason,
  recentAlarms,
  responseTime,
  storyCategories,
  storyline,
  todayPeriod,
  voiceCounts,
  voiceOutcome,
} from "./summary";
import type { Alert, LoggedEvent } from "./types";

const NOW = Date.parse("2026-10-02T14:00:00.000Z");
const at = (iso: string) => Date.parse(iso);
const MIN = 60_000;

function alert(over: Partial<Alert>): Alert {
  return {
    id: "a",
    kind: "empty",
    containerId: "fetsund-c1",
    startedAt: "2026-10-02T10:00:00.000Z",
    raisedAt: "2026-10-02T10:00:00.000Z",
    clearedAt: "2026-10-02T10:30:00.000Z",
    raisedEventId: null,
    snapshot: null,
    confidence: null,
    fillScore: null,
    ackedAt: null,
    ackedBy: null,
    label: null,
    ...over,
  };
}

function event(over: Partial<LoggedEvent>): LoggedEvent {
  return {
    id: "e",
    type: "heartbeat",
    source: "edge",
    containerId: "fetsund-c1",
    deviceId: "spectr-pi",
    at: "2026-10-02T10:00:00.000Z",
    receivedAt: "2026-10-02T10:00:00.000Z",
    seq: null,
    state: null,
    confidence: null,
    fillScore: null,
    snapshot: null,
    alertId: null,
    payload: {},
    ...over,
  };
}

// A heartbeat every five minutes between two times.
function heartbeats(from: string, to: string, state: "empty" | "filled" | null = "filled"): LoggedEvent[] {
  const out: LoggedEvent[] = [];
  for (let t = at(from); t <= at(to); t += 5 * MIN) out.push(event({ id: `hb-${t}`, at: new Date(t).toISOString(), state, payload: { labelsEmpty: 3 } }));
  return out;
}

describe("periods and buckets", () => {
  it("today runs from local midnight to now, one bucket per hour so far", () => {
    const p = todayPeriod(NOW);
    expect(p.to).toBe(NOW + 1);
    expect(new Date(p.from).getHours()).toBe(0);
    const buckets = hourBuckets(NOW);
    expect(buckets.length).toBe(new Date(NOW).getHours() + 1);
    expect(buckets[buckets.length - 1].to).toBe(NOW + 1);
  });
});

describe("alarmIntervals", () => {
  const period = lastDays(7, NOW);

  it("clips to the period and marks open alarms as ongoing", () => {
    const open = alert({ id: "open", raisedAt: "2026-10-02T13:00:00.000Z", clearedAt: null });
    const old = alert({ id: "old", raisedAt: "2026-09-01T10:00:00.000Z", clearedAt: "2026-09-01T11:00:00.000Z" });
    const list = alarmIntervals([alert({}), open, old], "empty", period);
    expect(list.map((i) => i.alertId)).toEqual(["a", "open"]);
    expect(list[0]).toMatchObject({ kind: "empty", ongoing: false, from: at("2026-10-02T10:00:00.000Z"), to: at("2026-10-02T10:30:00.000Z") });
    expect(list[1]).toMatchObject({ ongoing: true, to: period.to });
  });

  it("reports camera alarms as camera intervals", () => {
    const cam = alert({ id: "cam", kind: "camera_offline" });
    expect(alarmIntervals([cam, alert({})], "camera_offline", period)[0].kind).toBe("camera");
  });
});

describe("disarmedIntervals", () => {
  const period = lastDays(7, NOW);

  it("runs from disarmed until the next sign of an armed Pi, and a restart changes nothing", () => {
    const events = [
      event({ type: "app_start", at: "2026-10-02T08:00:00.000Z" }),
      event({ type: "disarmed", at: "2026-10-02T09:00:00.000Z" }),
      event({ type: "app_start", at: "2026-10-02T09:30:00.000Z" }),
      event({ type: "armed", at: "2026-10-02T10:00:00.000Z" }),
      event({ type: "disarmed", at: "2026-10-02T12:00:00.000Z" }),
      event({ type: "empty", at: "2026-10-02T12:30:00.000Z", state: "empty" }),
    ];
    const list = disarmedIntervals(events, period);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ from: at("2026-10-02T09:00:00.000Z"), to: at("2026-10-02T10:00:00.000Z"), ongoing: false });
    expect(list[1]).toMatchObject({ from: at("2026-10-02T12:00:00.000Z"), to: at("2026-10-02T12:30:00.000Z"), ongoing: false });
  });

  it("keeps an unanswered disarmed open to the period end", () => {
    const list = disarmedIntervals([event({ type: "disarmed", at: "2026-10-02T12:00:00.000Z" })], period);
    expect(list[0]).toMatchObject({ to: period.to, ongoing: true });
  });
});

describe("contactGaps", () => {
  it("finds silences longer than the limit, including one that still goes on", () => {
    const events = [...heartbeats("2026-10-02T08:00:00.000Z", "2026-10-02T09:00:00.000Z"), ...heartbeats("2026-10-02T11:00:00.000Z", "2026-10-02T12:00:00.000Z")];
    const gaps = contactGaps(events, lastDays(1, NOW), NOW);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ kind: "nocontact", from: at("2026-10-02T09:00:00.000Z"), to: at("2026-10-02T11:00:00.000Z"), ongoing: false });
    expect(gaps[1]).toMatchObject({ from: at("2026-10-02T12:00:00.000Z"), to: NOW, ongoing: true });
  });

  it("reports nothing while the Pi keeps talking", () => {
    expect(contactGaps(heartbeats("2026-10-02T13:00:00.000Z", "2026-10-02T13:55:00.000Z"), lastDays(1, NOW), NOW)).toEqual([]);
  });
});

describe("numbers", () => {
  const period = lastDays(7, NOW);

  it("sums time empty and finds the longest stretch", () => {
    const b = alert({ id: "b", raisedAt: "2026-10-01T10:00:00.000Z", clearedAt: "2026-10-01T11:15:00.000Z" });
    const { totalMs, longestMs } = emptyTime([alert({}), b], period);
    expect(totalMs).toBe(105 * MIN);
    expect(longestMs).toBe(75 * MIN);
  });

  it("finds the typical time from empty to filled, ignoring alarms still open", () => {
    const b = alert({ id: "b", raisedAt: "2026-10-01T10:00:00.000Z", clearedAt: "2026-10-01T11:15:00.000Z" });
    const open = alert({ id: "open", clearedAt: null });
    expect(responseTime([alert({}), b, open], period)).toEqual({ medianMs: 52.5 * MIN, count: 2 });
    expect(responseTime([open], period)).toEqual({ medianMs: null, count: 0 });
  });

  it("counts only voice messages that belonged to an alarm", () => {
    const events = [
      event({ type: "voice_sent", alertId: "a" }),
      event({ type: "voice_failed", alertId: "a" }),
      event({ type: "voice_sent" }),
      event({ type: "voice_sent", alertId: "a", at: "2026-08-01T10:00:00.000Z" }),
    ];
    expect(voiceCounts(events, period)).toEqual({ sent: 1, failed: 1 });
  });

  it("counts empty alarms per day by the time they were raised", () => {
    const buckets = dayBuckets(7, NOW);
    const b = alert({ id: "b", raisedAt: "2026-10-01T10:00:00.000Z", clearedAt: "2026-10-01T11:00:00.000Z" });
    const counts = alarmsPerBucket([alert({}), b, alert({ id: "cam", kind: "camera_offline" })], buckets);
    expect(counts.reduce((s, n) => s + n, 0)).toBe(2);
    expect(counts[counts.length - 1]).toBe(1);
  });

  it("lists the newest alarms first, limited", () => {
    const b = alert({ id: "b", raisedAt: "2026-10-01T10:00:00.000Z" });
    const c = alert({ id: "c", raisedAt: "2026-10-02T12:00:00.000Z" });
    expect(recentAlarms([alert({}), b, c], period, 2).map((a) => a.id)).toEqual(["c", "a"]);
  });

  it("reads the voice outcome of one alarm", () => {
    const events = [event({ type: "voice_failed", alertId: "a" }), event({ type: "voice_sent", alertId: "a" })];
    expect(voiceOutcome(events, "a")).toBe("sent");
    expect(voiceOutcome([events[0]], "a")).toBe("failed");
    expect(voiceOutcome([], "a")).toBe("none");
  });

  it("names what the throttled register complains about", () => {
    expect(powerReason(0x50005)).toBe("undervoltage");
    expect(powerReason(0x80008)).toBe("heat");
    expect(powerReason(0x20002)).toBe("throttled");
    expect(powerReason(0x100)).toBe("other");
  });
});

describe("currentStatus", () => {
  it("reads a full silo from a talking Pi, with its monitoring, power and radio", () => {
    const events = [
      event({ type: "armed", at: "2026-10-02T08:00:00.000Z" }),
      ...heartbeats("2026-10-02T08:00:00.000Z", "2026-10-02T13:55:00.000Z"),
      event({ type: "power", at: "2026-10-02T08:00:00.000Z", payload: { throttled: 0 } }),
      event({ type: "voice_sent", at: "2026-10-01T09:00:00.000Z" }),
    ];
    const s = currentStatus(events, [], NOW);
    expect(s).toMatchObject({ silo: "full", contact: true, monitoring: "on", ready: true, cameraDownSince: null });
    expect(s.siloSince).toBe(at("2026-10-02T08:00:00.000Z"));
    expect(s.lastContactAt).toBe(at("2026-10-02T13:55:00.000Z"));
    expect(s.power).toEqual({ ok: true, throttled: 0, at: at("2026-10-02T08:00:00.000Z") });
    expect(s.radio).toEqual({ sentAt: at("2026-10-01T09:00:00.000Z"), failedAt: null });
  });

  it("counts full from the refill that ended the last alarm, not from an earlier heartbeat", () => {
    const done = alert({ id: "done", raisedAt: "2026-10-02T10:00:00.000Z", clearedAt: "2026-10-02T10:30:00.000Z" });
    const s = currentStatus(heartbeats("2026-10-02T08:00:00.000Z", "2026-10-02T13:55:00.000Z"), [done], NOW);
    expect(s.silo).toBe("full");
    expect(s.siloSince).toBe(at("2026-10-02T10:30:00.000Z"));
  });

  it("shows an open alarm as empty since it was raised, whatever the heartbeats say", () => {
    const open = alert({ id: "open", raisedAt: "2026-10-02T13:00:00.000Z", clearedAt: null });
    const s = currentStatus(heartbeats("2026-10-02T08:00:00.000Z", "2026-10-02T13:55:00.000Z"), [open], NOW);
    expect(s.silo).toBe("empty");
    expect(s.siloSince).toBe(at("2026-10-02T13:00:00.000Z"));
  });

  it("does not trust a silent Pi: unknown silo and monitoring since the last message", () => {
    const s = currentStatus(heartbeats("2026-10-02T08:00:00.000Z", "2026-10-02T09:00:00.000Z"), [], NOW);
    expect(s).toMatchObject({ silo: "unknown", contact: false, monitoring: "unknown" });
    expect(s.siloSince).toBe(at("2026-10-02T09:00:00.000Z"));
  });

  it("does not trust a dead camera, and says when the Pi has no reference photos", () => {
    const cam = alert({ id: "cam", kind: "camera_offline", startedAt: "2026-10-02T12:00:00.000Z", raisedAt: "2026-10-02T12:00:00.000Z", clearedAt: null });
    const events = [...heartbeats("2026-10-02T13:00:00.000Z", "2026-10-02T13:55:00.000Z", null), event({ type: "heartbeat", at: "2026-10-02T13:56:00.000Z", payload: { labelsEmpty: 0 } })];
    const s = currentStatus(events, [cam], NOW);
    expect(s).toMatchObject({ silo: "unknown", cameraDownSince: at("2026-10-02T12:00:00.000Z"), ready: false });
    expect(s.siloSince).toBe(at("2026-10-02T12:00:00.000Z"));
  });

  it("flags bad power from the last reading", () => {
    const events = [...heartbeats("2026-10-02T13:00:00.000Z", "2026-10-02T13:55:00.000Z"), event({ type: "power", at: "2026-10-02T13:30:00.000Z", payload: { throttled: 0x50005 } })];
    expect(currentStatus(events, [], NOW).power).toEqual({ ok: false, throttled: 0x50005, at: at("2026-10-02T13:30:00.000Z") });
  });
});

describe("coverage", () => {
  const period = lastDays(1, NOW);

  it("counts the time since the Pi first reported, and takes silence, camera and off out of it in that order", () => {
    // Talking 08:00 to 10:00 and 11:00 to 14:00; silent 10:00 to 11:00. Camera down 09:00 to 12:00, off 11:30 to 13:00.
    const events = [
      ...heartbeats("2026-10-02T08:00:00.000Z", "2026-10-02T10:00:00.000Z"),
      ...heartbeats("2026-10-02T11:00:00.000Z", "2026-10-02T13:55:00.000Z"),
      event({ type: "disarmed", at: "2026-10-02T11:30:00.000Z" }),
      event({ type: "armed", at: "2026-10-02T13:00:00.000Z" }),
    ];
    const cam = alert({ id: "cam", kind: "camera_offline", raisedAt: "2026-10-02T09:00:00.000Z", clearedAt: "2026-10-02T12:00:00.000Z" });
    const c = coverage(events, [cam], period, NOW);
    expect(c.noContactMs).toBe(60 * MIN);
    // Camera: 09:00 to 12:00 minus the silent hour.
    expect(c.cameraDownMs).toBe(120 * MIN);
    // Off: 11:30 to 13:00 minus the camera hour until 12:00.
    expect(c.disarmedMs).toBe(60 * MIN);
    // Six hours watched from 08:00 to 14:00, four of them lost.
    expect(c.share).toBeCloseTo(2 / 6, 5);
  });

  it("is complete when the Pi talked all period long with camera and monitoring on", () => {
    const c = coverage(heartbeats("2026-10-01T14:00:00.000Z", "2026-10-02T13:55:00.000Z"), [], period, NOW);
    expect(c.share).toBe(1);
    expect(c.noContactMs + c.cameraDownMs + c.disarmedMs).toBe(0);
  });

  it("has nothing to say before the Pi ever reported", () => {
    expect(coverage([], [], period, NOW).share).toBeNull();
  });
});

describe("storyCategories", () => {
  it("files each line under the chips that should show it", () => {
    const base = { at: NOW, to: null, ongoing: false };
    expect(storyCategories({ kind: "empty", ...base })).toEqual(["silo", "radio"]);
    expect(storyCategories({ kind: "camera", ...base })).toEqual(["camera"]);
    expect(storyCategories({ kind: "voiceTest", ...base })).toEqual(["radio"]);
    expect(storyCategories({ kind: "restart", ...base })).toEqual(["pi"]);
    expect(storyCategories({ kind: "nocontact", ...base })).toEqual(["pi"]);
  });
});

describe("storyline", () => {
  const period = lastDays(1, NOW);

  it("tells the period newest first: alarms with their voice, outages, silence, power, restarts, switches and radio tests", () => {
    const cam = alert({ id: "cam", kind: "camera_offline", raisedAt: "2026-10-02T11:00:00.000Z", clearedAt: "2026-10-02T11:20:00.000Z" });
    const events = [
      ...heartbeats("2026-10-02T06:00:00.000Z", "2026-10-02T07:00:00.000Z"),
      ...heartbeats("2026-10-02T09:00:00.000Z", "2026-10-02T13:55:00.000Z"),
      event({ type: "voice_sent", alertId: "a", at: "2026-10-02T10:00:10.000Z" }),
      event({ type: "power", at: "2026-10-02T09:00:00.000Z", payload: { throttled: 0x50005 } }),
      event({ type: "power", at: "2026-10-02T09:01:00.000Z", payload: { throttled: 0 } }),
      event({ type: "app_start", at: "2026-10-02T09:00:00.000Z" }),
      event({ type: "app_start", at: "2026-10-02T09:02:00.000Z" }),
      event({ type: "app_start", at: "2026-10-02T12:00:00.000Z" }),
      event({ type: "armed", at: "2026-10-02T09:05:00.000Z" }),
      event({ type: "voice_failed", at: "2026-10-02T09:06:00.000Z" }),
    ];
    const items = storyline(events, [alert({}), cam], period, NOW);
    expect(items.map((i) => `${i.kind}@${new Date(i.at).toISOString().slice(11, 16)}`)).toEqual([
      "restart@12:00",
      "camera@11:00",
      "empty@10:00",
      "voiceTest@09:06",
      "armed@09:05",
      "power@09:00",
      "restart@09:00",
      "nocontact@07:00",
    ]);
    expect(items[2]).toMatchObject({ to: at("2026-10-02T10:30:00.000Z"), ongoing: false, voice: "sent" });
    expect(items[3]).toMatchObject({ ok: false });
    expect(items[5]).toMatchObject({ throttled: 0x50005 });
    expect(items[6]).toMatchObject({ count: 2 });
    expect(items[7]).toMatchObject({ to: at("2026-10-02T09:00:00.000Z"), ongoing: false });
  });

  it("includes an outage that started before the period and still goes on", () => {
    const open = alert({ id: "open", raisedAt: "2026-09-30T10:00:00.000Z", clearedAt: null });
    const items = storyline([], [open], period, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "empty", ongoing: true, to: null });
  });
});
