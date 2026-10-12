import { describe, expect, it } from "vitest";
import { fraction, spikes, timeAt, timelineRange } from "./timeline";

const now = Date.parse("2026-10-12T12:05:00Z");
const range = timelineRange(now, 5 * 60_000);

describe("timeline", () => {
  it("maps moments onto the bar and back, clamped to the ends", () => {
    expect(range).toEqual({ from: now - 300_000, to: now });
    expect(fraction(range.from, range)).toBe(0);
    expect(fraction(now, range)).toBe(1);
    expect(fraction(now - 150_000, range)).toBe(0.5);
    expect(fraction(now - 900_000, range)).toBe(0);
    expect(fraction(now + 900_000, range)).toBe(1);
    expect(timeAt(0.25, range)).toBe(now - 225_000);
    expect(timeAt(2, range)).toBe(now);
  });

  it("puts a spike at each event inside the range, in time order, in its colour", () => {
    const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString();
    const events = [
      { id: "b", at: at(60), color: "#2" },
      { id: "a", at: at(240), color: "#1" },
      { id: "old", at: at(900), color: "#0" },
      { id: "ahead", at: at(-30), color: "#3" },
    ];
    expect(spikes(events, range)).toEqual([
      { id: "a", x: 0.2, color: "#1" },
      { id: "b", x: 0.8, color: "#2" },
    ]);
    expect(spikes([], range)).toEqual([]);
  });
});
