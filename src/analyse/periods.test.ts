import { describe, expect, it } from "vitest";
import { dayBuckets, lastDays, weekBuckets } from "./periods";

describe("periods", () => {
  const now = Date.parse("2026-09-09T13:45:00Z");

  it("lastDays starts at local midnight days ago and reaches now", () => {
    const p = lastDays(7, now);
    expect(p.to).toBe(now + 1);
    expect(new Date(p.from).getHours()).toBe(0);
    expect((now - p.from) / 86_400_000).toBeGreaterThan(6);
    expect((now - p.from) / 86_400_000).toBeLessThan(7.1);
  });

  it("day buckets are contiguous, oldest first, reaching now", () => {
    const buckets = dayBuckets(7, now);
    expect(buckets).toHaveLength(7);
    expect(buckets[0].from).toBe(lastDays(7, now).from);
    expect(buckets.at(-1)?.to).toBe(now + 1);
    for (let i = 1; i < buckets.length; i += 1) expect(buckets[i].from).toBe(buckets[i - 1].to);
  });

  it("week buckets cover the range with the oldest one shorter", () => {
    const buckets = weekBuckets(30, now);
    expect(buckets).toHaveLength(5);
    expect(buckets[0].from).toBe(lastDays(30, now).from);
    expect(buckets.at(-1)?.to).toBe(now + 1);
    for (let i = 1; i < buckets.length; i += 1) expect(buckets[i].from).toBe(buckets[i - 1].to);
    expect(weekBuckets(7, now)).toHaveLength(1);
  });
});
