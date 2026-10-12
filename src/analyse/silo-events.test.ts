import { describe, expect, it } from "vitest";
import { lastRowIdsIn, mirrorSiloFacts, type SiloFact, type SiloRow, type SiloTable } from "./silo-events";
import type { Alert, AlertKind } from "./types";

const T0 = "2026-10-02T06:00:00+00:00";
const T1 = "2026-10-02T06:05:00+00:00";
const T2 = "2026-10-02T06:10:00+00:00";
const T3 = "2026-10-02T06:15:00+00:00";

function fact(table: SiloTable, id: number, over: Partial<SiloRow> = {}): SiloFact {
  return { table, row: { id, site_id: "spectr-pi", ts: T0, created_at: T0, ...over } };
}

function mirror(facts: SiloFact[], active: Alert[] = []) {
  let n = 0;
  return mirrorSiloFacts(facts, {
    containerForSite: (site) => (site === "spectr-pi" ? "fetsund-c1" : null),
    activeAlert: (containerId, kind: AlertKind) =>
      active.find((alert) => alert.containerId === containerId && alert.kind === kind && !alert.clearedAt) ?? null,
    now: () => Date.parse("2026-10-02T07:00:00Z"),
    newId: () => `id-${++n}`,
  });
}

const types = (result: ReturnType<typeof mirror>) => result.events.map((event) => event.type);

describe("mirrorSiloFacts", () => {
  it("opens one alarm from a silo_empty row, with the empty event as proof and the frame path", () => {
    const r = mirror([fact("silo_empty", 1)]);
    expect(types(r)).toEqual(["empty", "alert_raised"]);
    expect(r.alerts).toHaveLength(1);
    const alert = r.alerts[0];
    expect(alert.kind).toBe("empty");
    expect(alert.containerId).toBe("fetsund-c1");
    expect(alert.raisedAt).toBe(T0);
    expect(alert.clearedAt).toBeNull();
    expect(alert.raisedEventId).toBe(r.events[0].id);
    expect(alert.snapshot).toEqual({ id: `spectr-pi/alerts/${Math.floor(Date.parse(T0) / 1000)}.jpg`, url: null });
    expect(r.events[0]).toMatchObject({ state: "empty", deviceId: "spectr-pi", seq: 1, alertId: alert.id, payload: { table: "silo_empty", rowId: 1 } });
    expect(r.lastRowIds).toEqual({ silo_empty: 1 });
  });

  it("does not open a second alarm when the Pi announces again while one is open", () => {
    const r = mirror([fact("silo_empty", 1), fact("silo_empty", 2, { ts: T1 })]);
    expect(types(r)).toEqual(["empty", "alert_raised", "empty"]);
    expect(r.alerts).toHaveLength(1);
    expect(r.events[2].alertId).toBe(r.alerts[0].id);
  });

  it("closes the alarm on the silo_full row, with the confidence, and keeps the daily full note apart", () => {
    const r = mirror([fact("silo_empty", 1), fact("silo_full", 1, { ts: T1, confidence: 0.41 }), fact("silo_full", 2, { ts: T2, confidence: 0.4 })]);
    expect(types(r)).toEqual(["empty", "alert_raised", "filled", "alert_cleared", "filled"]);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0].clearedAt).toBe(T1);
    expect(r.events[2]).toMatchObject({ state: "filled", confidence: 0.41, alertId: r.alerts[0].id });
    expect(r.events[4]).toMatchObject({ state: "filled", alertId: null, payload: { note: "daily" } });
  });

  it("never opens or closes an alarm from a heartbeat after silo_full exists; the Pi decides", () => {
    const r = mirror([fact("silo_empty", 1), fact("silo_heartbeat", 1, { ts: T1, empty: false, checks: 20 })]);
    expect(types(r)).toEqual(["empty", "alert_raised", "heartbeat"]);
    expect(r.alerts[0].clearedAt).toBeNull();
    expect(r.events[2].state).toBe("filled");
    expect(r.events[2].payload).toMatchObject({ checks: 20 });
    expect(mirror([fact("silo_heartbeat", 2, { empty: true })]).alerts).toHaveLength(0);
  });

  it("lets an old heartbeat close an old alarm, from before the Pi wrote silo_full rows", () => {
    const old = "2026-09-21T17:06:56+00:00";
    const later = "2026-09-22T16:44:21+00:00";
    const r = mirror([fact("silo_empty", 1, { ts: old }), fact("silo_heartbeat", 1, { ts: later, empty: false })]);
    expect(types(r)).toEqual(["empty", "alert_raised", "heartbeat", "filled", "alert_cleared"]);
    expect(r.alerts[0].clearedAt).toBe(later);
  });

  it("reads a heartbeat with no verdict as no state, and keeps the reference counters", () => {
    const r = mirror([fact("silo_heartbeat", 1, { empty: null, checks: 0, labels_empty: 0, labels_full: 0 })]);
    expect(r.events[0].state).toBeNull();
    expect(r.events[0].payload).toMatchObject({ labelsEmpty: 0, labelsFull: 0 });
  });

  it("logs power readings with the throttled register", () => {
    const r = mirror([fact("silo_power", 1, { throttled: 0 }), fact("silo_power", 2, { ts: T1, throttled: 0x50005 })]);
    expect(types(r)).toEqual(["power", "power"]);
    expect(r.events[1].payload).toMatchObject({ table: "silo_power", throttled: 0x50005 });
  });

  it("opens and closes the camera alarm from silo_camera_down and silo_camera_up", () => {
    const r = mirror([fact("silo_camera_down", 1), fact("silo_camera_down", 2, { ts: T1 }), fact("silo_camera_up", 1, { ts: T2 })]);
    expect(types(r)).toEqual(["camera_offline", "alert_raised", "camera_offline", "camera_online", "alert_cleared"]);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0].kind).toBe("camera_offline");
    expect(r.alerts[0].clearedAt).toBe(T2);
  });

  it("ties radio results to the open empty alarm, and leaves tests without one", () => {
    const r = mirror([fact("silo_radio_tx", 1, { ts: T0, empty: false }), fact("silo_empty", 1, { ts: T1 }), fact("silo_radio_tx", 2, { ts: T1, empty: true }), fact("silo_radio_fail", 1, { ts: T2, empty: true })]);
    expect(types(r)).toEqual(["voice_sent", "empty", "alert_raised", "voice_sent", "voice_failed"]);
    expect(r.events[0].alertId).toBeNull();
    expect(r.events[3].alertId).toBe(r.alerts[0].id);
    expect(r.events[4].alertId).toBe(r.alerts[0].id);
  });

  it("logs app_start, armed and disarmed with the silo state the Pi had", () => {
    const r = mirror([fact("silo_app_start", 1, { empty: false }), fact("silo_armed", 1, { ts: T1, empty: false }), fact("silo_disarmed", 1, { ts: T2, empty: true })]);
    expect(types(r)).toEqual(["app_start", "armed", "disarmed"]);
    expect(r.events[2].state).toBe("empty");
  });

  it("closes the alarm when a later row says the Pi has let it go", () => {
    const r = mirror([fact("silo_empty", 1), fact("silo_app_start", 1, { ts: T1, empty: true }), fact("silo_app_start", 2, { ts: T2, empty: false })]);
    expect(types(r)).toEqual(["empty", "alert_raised", "app_start", "app_start", "alert_cleared"]);
    expect(r.alerts[0].clearedAt).toBe(T2);
    const radio = mirror([fact("silo_empty", 1), fact("silo_radio_tx", 1, { ts: T1, empty: false })]);
    expect(types(radio)).toEqual(["empty", "alert_raised", "voice_sent", "alert_cleared"]);
  });

  it("clears an alarm that was already open in the store", () => {
    const open: Alert = {
      id: "old",
      kind: "empty",
      containerId: "fetsund-c1",
      startedAt: T0,
      raisedAt: T0,
      clearedAt: null,
      raisedEventId: null,
      snapshot: null,
      confidence: null,
      fillScore: null,
      ackedAt: null,
      ackedBy: null,
      label: null,
    };
    const r = mirror([fact("silo_full", 5, { ts: T1 })], [open]);
    expect(types(r)).toEqual(["filled", "alert_cleared"]);
    expect(r.alerts).toEqual([{ ...open, clearedAt: T1 }]);
  });

  it("skips unknown sites but still moves lastRowIds for every table", () => {
    const r = mirror([fact("silo_heartbeat", 7, { site_id: "someone-else" }), fact("silo_power", 9, { site_id: "someone-else" })]);
    expect(r.events).toHaveLength(0);
    expect(r.lastRowIds).toEqual({ silo_heartbeat: 7, silo_power: 9 });
  });

  it("folds facts from different tables in time order however they arrive", () => {
    const r = mirror([fact("silo_full", 1, { ts: T3 }), fact("silo_heartbeat", 1, { ts: T2, empty: true }), fact("silo_radio_tx", 1, { ts: T1 }), fact("silo_empty", 1, { ts: T0 })]);
    expect(types(r)).toEqual(["empty", "alert_raised", "voice_sent", "heartbeat", "filled", "alert_cleared"]);
    expect(r.events[2].alertId).toBe(r.alerts[0].id);
  });

  it("puts the alarm before its radio message when both carry the same second", () => {
    const r = mirror([fact("silo_radio_tx", 1, { empty: true }), fact("silo_empty", 1)]);
    expect(types(r)).toEqual(["empty", "alert_raised", "voice_sent"]);
    expect(r.events[2].alertId).toBe(r.alerts[0].id);
  });
});

describe("lastRowIdsIn", () => {
  it("finds the highest mirrored row per table for the given sites", () => {
    const r = mirror([fact("silo_heartbeat", 3), fact("silo_heartbeat", 8, { ts: T1 }), fact("silo_power", 2), fact("silo_empty", 4, { site_id: "someone-else" })]);
    expect(lastRowIdsIn(r.events, ["spectr-pi"])).toEqual({ silo_heartbeat: 8, silo_power: 2 });
    expect(lastRowIdsIn(r.events, ["other"])).toEqual({});
  });
});
