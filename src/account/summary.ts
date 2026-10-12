import { USAGE_FEATURES } from "./types";
import type { Plan, Subscription, UsageEvent, UsageFeature } from "./types";

export type BillingPeriod = { from: number; to: number };

export type UsageSummary = {
  period: BillingPeriod;
  used: number;
  limit: number;
  left: number;
  share: number;
  cost: number;
  perDay: { from: number; tokens: number }[];
  perFeature: { feature: UsageFeature; tokens: number; cost: number; share: number }[];
  topFeature: UsageFeature | null;
};

export function startOfDay(t: number): number {
  const date = new Date(t);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addMonths(t: number, months: number): number {
  const date = new Date(t);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  // The 31st lands on the last day of a shorter month instead of spilling into the next one.
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return date.getTime();
}

export function billingPeriod(subscription: Subscription, now: number): BillingPeriod {
  const renewsAt = Date.parse(subscription.renewsAt);
  const startedAt = Date.parse(subscription.startedAt);
  // The first period starts at the start date itself. A canceled subscription ends at renewsAt and never rolls on.
  if (now < renewsAt || subscription.status === "canceled") return { from: Math.max(startedAt, addMonths(renewsAt, -1)), to: renewsAt };
  // Past the renewal the subscription has renewed whether or not anyone updated the record. Counting from
  // the start keeps a 31st anchored even after a shorter month clamped the renewal date.
  let months = 1;
  while (addMonths(startedAt, months) <= now) months += 1;
  return { from: addMonths(startedAt, months - 1), to: addMonths(startedAt, months) };
}

export function summarizeUsage(events: readonly UsageEvent[], plan: Plan, subscription: Subscription, now: number, days = 30): UsageSummary {
  const period = billingPeriod(subscription, now);
  const end = Math.min(period.to, now + 1);
  const billed = events.filter((event) => {
    const at = Date.parse(event.at);
    return at >= period.from && at < end;
  });
  const used = total(billed, tokensOf);
  const limit = plan.monthlyTokens;

  const perDay = Array.from({ length: days }, (_, index) => ({ from: dayStart(now, days - 1 - index), tokens: 0 }));
  const byDay = new Map(perDay.map((bucket) => [bucket.from, bucket] as const));
  for (const event of events) {
    const bucket = byDay.get(startOfDay(Date.parse(event.at)));
    if (bucket) bucket.tokens += tokensOf(event);
  }

  const perFeature = USAGE_FEATURES.map((feature) => {
    const own = billed.filter((event) => event.feature === feature);
    const tokens = total(own, tokensOf);
    return { feature, tokens, cost: round2(total(own, (event) => event.cost)), share: used > 0 ? tokens / used : 0 };
  });
  const top = perFeature.reduce((best, item) => (item.tokens > best.tokens ? item : best));

  return {
    period,
    used,
    limit,
    left: Math.max(0, limit - used),
    share: limit > 0 ? used / limit : 0,
    cost: round2(total(billed, (event) => event.cost)),
    perDay,
    perFeature,
    topFeature: used > 0 ? top.feature : null,
  };
}

function dayStart(now: number, back: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() - back);
  return startOfDay(date.getTime());
}

function tokensOf(event: UsageEvent) {
  return event.tokensIn + event.tokensOut;
}

function total(events: readonly UsageEvent[], pick: (event: UsageEvent) => number) {
  return events.reduce((sum, event) => sum + pick(event), 0);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
