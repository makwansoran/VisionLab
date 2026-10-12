// Half-open interval [from, to) in ms.
export type Period = { from: number; to: number };

export function inPeriod(iso: string, period: Period): boolean {
  const time = Date.parse(iso);
  return time >= period.from && time < period.to;
}

export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addDays(time: number, days: number): number {
  const date = new Date(time);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

// Periods are half-open, so a live period ends one ms after now to include this very moment.
export function liveEnd(now: number): number {
  return now + 1;
}

// The last days calendar days including today, as one period reaching now.
export function lastDays(days: number, now: number): Period {
  return { from: addDays(startOfDay(now), -(days - 1)), to: liveEnd(now) };
}

// Calendar-day buckets covering lastDays, oldest first.
export function dayBuckets(days: number, now: number): Period[] {
  const out: Period[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const from = addDays(startOfDay(now), -i);
    out.push({ from, to: Math.min(addDays(from, 1), liveEnd(now)) });
  }
  return out;
}

// Seven-day buckets ending today, oldest first. The oldest may be shorter.
export function weekBuckets(days: number, now: number): Period[] {
  const start = lastDays(days, now).from;
  const out: Period[] = [];
  let hi = liveEnd(now);
  let lo = addDays(startOfDay(now), -6);
  while (hi > start) {
    out.unshift({ from: Math.max(lo, start), to: hi });
    hi = lo;
    lo = addDays(lo, -7);
  }
  return out;
}
