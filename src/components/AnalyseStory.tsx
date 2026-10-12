import { useState, type ReactNode } from "react";
import { fmtClock, fmtDay, fmtDuration, fmtWeekday } from "../analyse/format";
import { t } from "../analyse/strings";
import { powerReason, storyCategories, type StoryCategory, type StoryItem } from "../analyse/summary";

const LIMIT = 40;

type Filter = "all" | StoryCategory;

const FILTERS: readonly Filter[] = ["all", "silo", "camera", "pi", "radio"];

export function AnalyseStory({
  items,
  now,
  grouped,
}: {
  items: readonly StoryItem[];
  now: number;
  // Over more than one day, lines sit under a heading per day.
  grouped: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = count(items);
  const visible = filter === "all" ? items : items.filter((item) => storyCategories(item).includes(filter));
  const dayOf = (ms: number) => `${fmtWeekday(ms)} ${fmtDay(ms)}`;
  // Under a day heading the clock is enough. On its own, anything older than today needs the day too.
  const when = (ms: number) => (grouped || sameDay(ms, now) ? fmtClock(ms) : `${dayOf(ms)} ${fmtClock(ms)}`);

  const rows: ReactNode[] = [];
  let lastDay = "";
  for (const [index, item] of visible.slice(0, LIMIT).entries()) {
    const day = new Date(item.at).toDateString();
    if (grouped && day !== lastDay) {
      rows.push(
        <li key={`day-${day}`} className="ana-story-day">
          {sameDay(item.at, now) ? t.today : dayOf(item.at)}
        </li>,
      );
      lastDay = day;
    }
    const { tone, headline, detail } = describe(item, now);
    rows.push(
      <li key={`${item.kind}-${item.at}-${index}`} className={`ana-story-item ana-story-${tone}`}>
        <span className="ana-story-when">{when(item.at)}</span>
        <span className="ana-story-text">
          {headline}
          {detail ? <span className="ana-story-detail"> · {detail}</span> : null}
        </span>
      </li>,
    );
  }

  return (
    <div className="ana-story">
      <div className="ana-story-filters" role="group" aria-label={t.story}>
        {FILTERS.map((name) => (
          <button key={name} type="button" className={filter === name ? "active" : undefined} aria-pressed={filter === name} onClick={() => setFilter(name)}>
            {t.filters[name]}
            <span>{counts[name]}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="ana-muted">{t.noStory}</p>
      ) : (
        <ul className="ana-story-list">
          {rows}
          {visible.length > LIMIT ? <li className="ana-story-more">{t.more(visible.length - LIMIT)}</li> : null}
        </ul>
      )}
    </div>
  );
}

function count(items: readonly StoryItem[]): Record<Filter, number> {
  const out: Record<Filter, number> = { all: items.length, silo: 0, camera: 0, pi: 0, radio: 0 };
  for (const item of items) for (const category of storyCategories(item)) out[category] += 1;
  return out;
}

type Tone = "critical" | "warn" | "muted";

function describe(item: StoryItem, now: number): { tone: Tone; headline: string; detail: string } {
  const n = t.now;
  // The end of something that lasts: "until 14:31 (29 min)", with the day when it ended on another one.
  const endAt = (to: number) => (sameDay(to, item.at) ? fmtClock(to) : `${fmtWeekday(to)} ${fmtDay(to)} ${fmtClock(to)}`);
  const span = item.to !== null ? t.item.until(endAt(item.to), fmtDuration(item.to - item.at)) : t.item.still(fmtDuration(now - item.at));

  switch (item.kind) {
    case "empty": {
      const voice = item.voice === "sent" ? t.item.voiceSent : item.voice === "failed" ? t.item.voiceFailed : t.item.voiceNone;
      const end = item.to !== null ? t.item.filledAt(endAt(item.to), fmtDuration(item.to - item.at)) : t.item.stillEmpty(fmtDuration(now - item.at));
      return { tone: "critical", headline: t.item.empty, detail: `${end} · ${voice}` };
    }
    case "camera":
      return { tone: "warn", headline: t.item.camera, detail: span };
    case "nocontact":
      return { tone: "warn", headline: t.item.noContact, detail: span };
    case "power":
      return { tone: "warn", headline: t.item.power, detail: n.powerReason[powerReason(item.throttled ?? 0)] };
    case "restart":
      return { tone: "muted", headline: t.item.restart, detail: (item.count ?? 1) > 1 ? t.item.restarts(item.count ?? 1) : "" };
    case "armed":
      return { tone: "muted", headline: t.item.armed, detail: "" };
    case "disarmed":
      return { tone: "warn", headline: t.item.disarmed, detail: "" };
    case "voiceTest":
      return item.ok ? { tone: "muted", headline: t.item.voiceTest, detail: "" } : { tone: "warn", headline: t.item.voiceTestFailed, detail: "" };
    default:
      return { tone: "muted", headline: "", detail: "" };
  }
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
