import { LANG } from "./strings";

const locale = LANG === "no" ? "nb-NO" : "en-GB";

const dateTime = new Intl.DateTimeFormat(locale, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dayMonth = new Intl.DateTimeFormat(locale, LANG === "no" ? { day: "2-digit", month: "2-digit" } : { day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });

export function fmtTime(value: string | number): string {
  return dateTime.format(new Date(value));
}

export function fmtDay(ms: number): string {
  return dayMonth.format(new Date(ms));
}

// Just the time of day, for timelines and lists where the day is already known.
export function fmtClock(value: string | number): string {
  return clock.format(new Date(value));
}

export function fmtWeekday(value: string | number): string {
  return weekday.format(new Date(value));
}

export function fmtDuration(ms: number): string {
  const hour = LANG === "no" ? "t" : "h";
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 48 * 3_600_000) return `${(ms / 3_600_000).toFixed(1)} ${hour}`;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.round((ms - days * 86_400_000) / 3_600_000);
  return hours > 0 ? `${days} d ${hours} ${hour}` : `${days} d`;
}
