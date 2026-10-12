export type TimeRange = { from: number; to: number };

export function timelineRange(now: number, keepMs: number): TimeRange {
  return { from: now - keepMs, to: now };
}

// Where a moment sits on the bar, 0 at the left edge and 1 at the right.
export function fraction(time: number, range: TimeRange): number {
  const span = range.to - range.from;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (time - range.from) / span));
}

export function timeAt(position: number, range: TimeRange): number {
  return range.from + Math.min(1, Math.max(0, position)) * (range.to - range.from);
}

export type Spike = { id: string; x: number; color: string };

// The telemetry line: flat while nothing happens, a spike in the event's colour where something did.
export function spikes(events: readonly { id: string; at: string; color: string }[], range: TimeRange): Spike[] {
  return events
    .map((event) => ({ id: event.id, color: event.color, time: Date.parse(event.at) }))
    .filter((event) => event.time >= range.from && event.time <= range.to)
    .sort((a, b) => a.time - b.time)
    .map((event) => ({ id: event.id, color: event.color, x: fraction(event.time, range) }));
}
