import { describe, expect, it } from "vitest";
import { costOf, planById } from "./plans";
import { demoSubscription, demoUsage, seedAccount } from "./seed";
import type { AccountStores } from "./stores";
import { addMonths, startOfDay } from "./summary";
import type { Subscription, UsageEvent, UsageFeature } from "./types";

const now = new Date(2026, 9, 11, 14, 30).getTime();
const limit = planById("pro").monthlyTokens;

function memoryStores(): AccountStores {
  let events: UsageEvent[] = [];
  let subscription: Subscription | null = null;
  return {
    usage: {
      async list() {
        return events;
      },
      async add(event) {
        events = [...events, event];
      },
      async replace(next) {
        events = next;
      },
    },
    subscription: {
      async load() {
        return subscription;
      },
      async save(next) {
        subscription = next;
      },
    },
  };
}

function daysBefore(time: number, days: number) {
  const date = new Date(time);
  date.setDate(date.getDate() - days);
  return date.getTime();
}

function tokensOf(events: UsageEvent[]) {
  return events.reduce((sum, event) => sum + event.tokensIn + event.tokensOut, 0);
}

describe("demoSubscription", () => {
  it("is a Pro plan that started 26 days ago at nine", () => {
    const subscription = demoSubscription(now);
    const started = new Date(daysBefore(now, 26));
    started.setHours(9, 0, 0, 0);
    expect(subscription).toEqual({
      planId: "pro",
      startedAt: started.toISOString(),
      renewsAt: new Date(addMonths(started.getTime(), 1)).toISOString(),
      status: "active",
    });
  });
});

describe("demoUsage", () => {
  const events = demoUsage(now);

  it("is the same on every start", () => {
    expect(demoUsage(now)).toEqual(events);
    expect(events[0].id).toBe("demo-0001");
    expect(events.map((event) => event.id)).toEqual(events.map((_, index) => `demo-${String(index + 1).padStart(4, "0")}`));
  });

  it("runs oldest first through the last 30 days", () => {
    const times = events.map((event) => Date.parse(event.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBeGreaterThanOrEqual(startOfDay(daysBefore(now, 29)));
    expect(times[times.length - 1]).toBeLessThan(startOfDay(daysBefore(now, -1)));
  });

  it("keeps weekends quiet and weekdays busy", () => {
    const perDay = new Map<number, number>();
    for (const event of events) {
      const day = startOfDay(Date.parse(event.at));
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    for (let back = 0; back < 30; back += 1) {
      const day = startOfDay(daysBefore(now, back));
      const count = perDay.get(day) ?? 0;
      const weekday = new Date(day).getDay();
      if (weekday === 0 || weekday === 6) {
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(2);
      } else {
        expect(count).toBeGreaterThanOrEqual(3);
        expect(count).toBeLessThanOrEqual(9);
      }
    }
  });

  it("works office hours", () => {
    for (const event of events) {
      const hour = new Date(event.at).getHours();
      expect(hour).toBeGreaterThanOrEqual(7);
      expect(hour).toBeLessThan(17);
    }
  });

  it("prices every event with the Argus rate and trains five times larger", () => {
    for (const event of events) {
      expect(event.model).toBe("Argus 1.0");
      expect(event.cost).toBe(costOf("Argus 1.0", event.tokensIn, event.tokensOut));
      const scale = event.feature === "training" ? 5 : 1;
      expect(event.tokensIn).toBeGreaterThanOrEqual(300 * scale);
      expect(event.tokensIn).toBeLessThanOrEqual(7600 * scale);
      expect(event.tokensOut).toBeGreaterThanOrEqual(100 * scale);
      expect(event.tokensOut).toBeLessThanOrEqual(3200 * scale);
    }
  });

  it("leans on labeling", () => {
    const counts: Record<UsageFeature, number> = { labeling: 0, training: 0, inference: 0, assistant: 0 };
    for (const event of events) counts[event.feature] += 1;
    expect(counts.labeling).toBeGreaterThan(counts.inference);
    expect(counts.inference).toBeGreaterThan(counts.training);
    expect(counts.training).toBeGreaterThan(counts.assistant);
  });

  it("stops today at the clock, so the chart and the totals agree", () => {
    const events = demoUsage(now);
    expect(events.every((event) => Date.parse(event.at) <= now)).toBe(true);
    const morning = demoUsage(new Date(2026, 9, 11, 7, 30).getTime());
    expect(morning).toEqual(events.slice(0, morning.length));
  });

  it("uses 55 to 70 percent of the Pro limit whatever day it starts", () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const used = tokensOf(demoUsage(daysBefore(now, offset)));
      expect(used).toBeGreaterThanOrEqual(limit * 0.55);
      expect(used).toBeLessThanOrEqual(limit * 0.7);
    }
  });
});

describe("seedAccount", () => {
  it("seeds an empty account once", async () => {
    const stores = memoryStores();
    expect(await seedAccount(stores, now)).toBe(true);
    expect(await stores.subscription.load()).toEqual(demoSubscription(now));
    expect(await stores.usage.list()).toEqual(demoUsage(now));

    const later = daysBefore(now, -1);
    expect(await seedAccount(stores, later)).toBe(false);
    expect(await stores.subscription.load()).toEqual(demoSubscription(now));
  });

  it("leaves a subscription or usage that is already there", async () => {
    const withSubscription = memoryStores();
    await withSubscription.subscription.save(demoSubscription(now));
    expect(await seedAccount(withSubscription, now)).toBe(false);
    expect(await withSubscription.usage.list()).toEqual([]);

    const withUsage = memoryStores();
    await withUsage.usage.add(demoUsage(now)[0]);
    expect(await seedAccount(withUsage, now)).toBe(false);
    expect(await withUsage.subscription.load()).toBeNull();
  });

  it("starts over when forced", async () => {
    const stores = memoryStores();
    await seedAccount(stores, now);
    const later = daysBefore(now, -3);
    expect(await seedAccount(stores, later, true)).toBe(true);
    expect(await stores.subscription.load()).toEqual(demoSubscription(later));
    expect(await stores.usage.list()).toEqual(demoUsage(later));
  });
});
