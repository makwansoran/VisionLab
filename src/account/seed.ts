import { costOf } from "./plans";
import type { AccountStores } from "./stores";
import { addMonths } from "./summary";
import type { Subscription, UsageEvent, UsageFeature } from "./types";

export const DEMO_SEED = 7;

export function demoSubscription(now: number): Subscription {
  const started = new Date(now);
  started.setDate(started.getDate() - 26);
  started.setHours(9, 0, 0, 0);
  return {
    planId: "pro",
    startedAt: started.toISOString(),
    renewsAt: new Date(addMonths(started.getTime(), 1)).toISOString(),
    status: "active",
  };
}

export function demoUsage(now: number, days = 30): UsageEvent[] {
  const random = mulberry32(DEMO_SEED);
  const events: UsageEvent[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = weekend ? between(random, 0, 2) : between(random, 3, 9);
    const minutes = Array.from({ length: count }, () => between(random, 0, 599)).sort((a, b) => a - b);
    for (const minute of minutes) {
      day.setHours(7, minute, 0, 0);
      // Today stops at the clock, so the chart and the totals agree.
      if (day.getTime() > now) break;
      const feature = pickFeature(random());
      const scale = feature === "training" ? 5 : 1;
      const tokensIn = between(random, 300, 7600) * scale;
      const tokensOut = between(random, 100, 3200) * scale;
      events.push({
        id: `demo-${String(events.length + 1).padStart(4, "0")}`,
        at: day.toISOString(),
        feature,
        model: "Argus 1.0",
        tokensIn,
        tokensOut,
        cost: costOf("Argus 1.0", tokensIn, tokensOut),
      });
    }
  }
  return events;
}

export async function seedAccount(stores: AccountStores, now: number, force = false): Promise<boolean> {
  if (!force) {
    const [subscription, events] = await Promise.all([stores.subscription.load(), stores.usage.list()]);
    if (subscription || events.length > 0) return false;
  }
  await stores.subscription.save(demoSubscription(now));
  await stores.usage.replace(demoUsage(now));
  return true;
}

// Labeling 45 percent, inference 30, training 15, assistant 10.
function pickFeature(roll: number): UsageFeature {
  if (roll < 0.45) return "labeling";
  if (roll < 0.75) return "inference";
  if (roll < 0.9) return "training";
  return "assistant";
}

function between(random: () => number, min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}

// A small seeded generator, so the demo looks the same on every start.
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
