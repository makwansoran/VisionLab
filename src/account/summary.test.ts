import { describe, expect, it } from "vitest";
import { addMonths, billingPeriod, startOfDay, summarizeUsage } from "./summary";
import type { Plan, Subscription, UsageEvent, UsageFeature } from "./types";

function at(year: number, month: number, day: number, hour = 0, minute = 0) {
  return new Date(year, month, day, hour, minute).getTime();
}

function renewing(renewsAt: number): Subscription {
  return {
    planId: "pro",
    startedAt: new Date(addMonths(renewsAt, -1)).toISOString(),
    renewsAt: new Date(renewsAt).toISOString(),
    status: "active",
  };
}

function usage(time: number, feature: UsageFeature, tokensIn: number, tokensOut: number, cost: number): UsageEvent {
  return { id: `event-${time}`, at: new Date(time).toISOString(), feature, model: "Argus 1.0", tokensIn, tokensOut, cost };
}

const plan: Plan = { id: "pro", name: "Pro", price: 1490, monthlyTokens: 10_000, features: [] };

describe("startOfDay", () => {
  it("is local midnight", () => {
    expect(startOfDay(at(2026, 9, 11, 15, 42))).toBe(at(2026, 9, 11));
    expect(startOfDay(at(2026, 9, 11))).toBe(at(2026, 9, 11));
  });
});

describe("addMonths", () => {
  it("keeps the day and the hour", () => {
    expect(addMonths(at(2026, 0, 15, 9), 1)).toBe(at(2026, 1, 15, 9));
    expect(addMonths(at(2026, 0, 15, 9), -2)).toBe(at(2025, 10, 15, 9));
    expect(addMonths(at(2026, 11, 15, 9), 1)).toBe(at(2027, 0, 15, 9));
  });

  it("clamps the 31st to a shorter month", () => {
    expect(addMonths(at(2026, 0, 31, 9), 1)).toBe(at(2026, 1, 28, 9));
    expect(addMonths(at(2026, 2, 31, 9), -1)).toBe(at(2026, 1, 28, 9));
    expect(addMonths(at(2028, 0, 31, 9), 1)).toBe(at(2028, 1, 29, 9));
  });
});

describe("billingPeriod", () => {
  it("is the month that ends at the renewal", () => {
    expect(billingPeriod(renewing(at(2026, 9, 20, 9)), at(2026, 9, 11, 12))).toEqual({ from: at(2026, 8, 20, 9), to: at(2026, 9, 20, 9) });
  });

  it("rolls forward once the renewal has passed", () => {
    const subscription = renewing(at(2026, 0, 15, 9));
    expect(billingPeriod(subscription, at(2026, 0, 15, 9))).toEqual({ from: at(2026, 0, 15, 9), to: at(2026, 1, 15, 9) });
    expect(billingPeriod(subscription, at(2026, 2, 20))).toEqual({ from: at(2026, 2, 15, 9), to: at(2026, 3, 15, 9) });
    expect(billingPeriod(subscription, at(2027, 5, 1))).toEqual({ from: at(2027, 4, 15, 9), to: at(2027, 5, 15, 9) });
  });

  it("keeps a renewal on the 31st at the end of every month", () => {
    const subscription = renewing(at(2026, 0, 31, 9));
    expect(billingPeriod(subscription, at(2026, 0, 10))).toEqual({ from: at(2025, 11, 31, 9), to: at(2026, 0, 31, 9) });
    expect(billingPeriod(subscription, at(2026, 1, 10))).toEqual({ from: at(2026, 0, 31, 9), to: at(2026, 1, 28, 9) });
    expect(billingPeriod(subscription, at(2026, 2, 15))).toEqual({ from: at(2026, 1, 28, 9), to: at(2026, 2, 31, 9) });
    expect(billingPeriod(subscription, at(2026, 3, 30, 10))).toEqual({ from: at(2026, 3, 30, 9), to: at(2026, 4, 31, 9) });
  });

  it("counts renewals from the start, so a clamped renewal keeps its day", () => {
    const subscription: Subscription = { planId: "pro", startedAt: new Date(at(2026, 0, 31, 9)).toISOString(), renewsAt: new Date(at(2026, 1, 28, 9)).toISOString(), status: "active" };
    expect(billingPeriod(subscription, at(2026, 1, 10))).toEqual({ from: at(2026, 0, 31, 9), to: at(2026, 1, 28, 9) });
    expect(billingPeriod(subscription, at(2026, 2, 15))).toEqual({ from: at(2026, 1, 28, 9), to: at(2026, 2, 31, 9) });
    expect(billingPeriod(subscription, at(2026, 3, 15))).toEqual({ from: at(2026, 2, 31, 9), to: at(2026, 3, 30, 9) });
  });

  it("stops at the end date of a canceled subscription", () => {
    const subscription: Subscription = { ...renewing(at(2026, 8, 15, 9)), status: "canceled" };
    expect(billingPeriod(subscription, at(2026, 8, 1))).toEqual({ from: at(2026, 7, 15, 9), to: at(2026, 8, 15, 9) });
    expect(billingPeriod(subscription, at(2026, 9, 11))).toEqual({ from: at(2026, 7, 15, 9), to: at(2026, 8, 15, 9) });
  });
});

describe("summarizeUsage", () => {
  const now = at(2026, 9, 11, 12);
  const subscription = renewing(at(2026, 9, 20, 9));
  const events = [
    usage(at(2026, 8, 1, 10), "inference", 9000, 9000, 9),
    usage(at(2026, 8, 19, 10), "labeling", 500, 100, 1),
    usage(at(2026, 8, 25, 10), "inference", 1000, 500, 0.5),
    usage(at(2026, 9, 11, 9), "labeling", 2000, 1000, 1.25),
    usage(at(2026, 9, 11, 12), "training", 500, 500, 0.1),
    usage(at(2026, 9, 11, 15), "assistant", 100, 100, 0.05),
  ];
  const summary = summarizeUsage(events, plan, subscription, now);

  it("counts the billing period up to now", () => {
    expect(summary.period).toEqual({ from: at(2026, 8, 20, 9), to: at(2026, 9, 20, 9) });
    expect(summary.used).toBe(5500);
    expect(summary.limit).toBe(10_000);
    expect(summary.left).toBe(4500);
    expect(summary.share).toBe(0.55);
    expect(summary.cost).toBe(1.85);
  });

  it("has one bucket per day, today last", () => {
    expect(summary.perDay).toHaveLength(30);
    expect(summary.perDay[0]).toEqual({ from: at(2026, 8, 12), tokens: 0 });
    expect(summary.perDay[7]).toEqual({ from: at(2026, 8, 19), tokens: 600 });
    expect(summary.perDay[29]).toEqual({ from: at(2026, 9, 11), tokens: 4200 });
    expect(summary.perDay.reduce((sum, bucket) => sum + bucket.tokens, 0)).toBe(6300);
    expect(summarizeUsage(events, plan, subscription, now, 7).perDay.map((bucket) => bucket.from)).toEqual([5, 6, 7, 8, 9, 10, 11].map((day) => at(2026, 9, day)));
  });

  it("splits the period by feature", () => {
    expect(summary.perFeature).toEqual([
      { feature: "labeling", tokens: 3000, cost: 1.25, share: 3000 / 5500 },
      { feature: "training", tokens: 1000, cost: 0.1, share: 1000 / 5500 },
      { feature: "inference", tokens: 1500, cost: 0.5, share: 1500 / 5500 },
      { feature: "assistant", tokens: 0, cost: 0, share: 0 },
    ]);
    expect(summary.topFeature).toBe("labeling");
  });

  it("never reports less than nothing left", () => {
    const heavy = summarizeUsage([usage(at(2026, 9, 10, 10), "training", 20_000, 5000, 1.7)], plan, subscription, now);
    expect(heavy.used).toBe(25_000);
    expect(heavy.left).toBe(0);
    expect(heavy.share).toBe(2.5);
    expect(heavy.topFeature).toBe("training");
  });

  it("stays calm with nothing to count", () => {
    const empty = summarizeUsage([], { ...plan, monthlyTokens: 0 }, subscription, now);
    expect(empty.used).toBe(0);
    expect(empty.left).toBe(0);
    expect(empty.share).toBe(0);
    expect(empty.cost).toBe(0);
    expect(empty.topFeature).toBeNull();
    expect(empty.perFeature.every((item) => item.tokens === 0 && item.share === 0)).toBe(true);
  });
});
