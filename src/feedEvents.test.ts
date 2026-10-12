import { beforeEach, describe, expect, it } from "vitest";
import { addFeedEvent, EVENT_COLORS, EVENT_KINDS, EVENT_NAMES, feedEvents, markFeedEventsSeen, resetFeedEvents, subscribeFeedEvents } from "./feedEvents";

const day = 24 * 60 * 60 * 1000;

describe("feed events", () => {
  beforeEach(() => {
    resetFeedEvents();
  });

  it("names and colours every kind", () => {
    for (const kind of EVENT_KINDS) {
      expect(EVENT_NAMES[kind]).toBeTruthy();
      expect(EVENT_COLORS[kind]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("logs an event with the default text and tells listeners", () => {
    let calls = 0;
    const off = subscribeFeedEvents(() => {
      calls += 1;
    });
    const event = addFeedEvent("cam-1", "empty");
    off();
    expect(event).toMatchObject({ cameraId: "cam-1", kind: "empty", text: "Silo empty", seen: false });
    expect(feedEvents()).toEqual([event]);
    expect(calls).toBe(1);
  });

  it("keeps a day of events and drops the rest when a new one arrives", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    const old = addFeedEvent("cam-1", "radio", undefined, new Date(now - day - 1000).toISOString());
    const kept = addFeedEvent("cam-1", "full", undefined, new Date(now - day + 60_000).toISOString());
    const latest = addFeedEvent("cam-1", "alert", "Rule fired", new Date(now).toISOString());
    expect(feedEvents().map((event) => event.id)).toEqual([kept.id, latest.id]);
    expect(feedEvents()).not.toContainEqual(old);
    expect(latest.text).toBe("Rule fired");
  });

  it("marks the unseen events of one camera as seen", () => {
    addFeedEvent("cam-1", "alert");
    addFeedEvent("cam-2", "alert");
    markFeedEventsSeen("cam-1");
    expect(feedEvents().map((event) => [event.cameraId, event.seen])).toEqual([
      ["cam-1", true],
      ["cam-2", false],
    ]);
  });
});
