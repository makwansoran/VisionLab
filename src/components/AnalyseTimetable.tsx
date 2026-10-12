import { fmtClock, fmtDay, fmtDuration, fmtWeekday } from "../analyse/format";
import { startOfDay, type Period } from "../analyse/periods";
import { t } from "../analyse/strings";
import { alarmIntervals, contactGaps, disarmedIntervals, type StateInterval, type StateKind } from "../analyse/summary";
import type { Alert, LoggedEvent } from "../analyse/types";

const HOUR = 3_600_000;
const HOUR_LABELS = [0, 6, 12, 18];

// One row per day, hours across, like a shift plan. Teal where the silo was fine, red where it was empty,
// amber where the camera was down, light grey where monitoring was off, hatched where the Pi went quiet,
// and neutral where it had not reported yet.
export function AnalyseTimetable({
  days,
  now,
  since,
  alerts,
  events,
}: {
  // One period per day, oldest first. Rows are shown newest first.
  days: readonly Period[];
  now: number;
  // When the Pi first reported. Earlier stretches show as no data, not as OK. Null when it never has.
  since: number | null;
  alerts: readonly Alert[];
  events: readonly LoggedEvent[];
}) {
  const rows = [...days].reverse();
  const todayStart = startOfDay(now);
  const names: Record<StateKind, string> = { empty: t.legend.empty, camera: t.legend.camera, disarmed: t.legend.disarmed, nocontact: t.legend.noContact };

  const describe = (block: StateInterval, label: string, start: number, end: number) => {
    const name = names[block.kind];
    const ongoing = block.ongoing && block.to >= now - 1000;
    if (block.from <= start && block.to >= end) return `${label} · ${name} · ${t.allDay}`;
    if (ongoing) return `${label} · ${name} · ${fmtClock(block.from)} · ${t.ongoing}`;
    return `${label} · ${name} · ${t.between(fmtClock(block.from), fmtClock(block.to), fmtDuration(block.to - block.from))}`;
  };

  return (
    <div className={rows.length > 10 ? "ana-tt ana-tt-dense" : "ana-tt"}>
      <div className="ana-tt-head">
        <span className="ana-tt-label" />
        <div className="ana-tt-hours">
          {HOUR_LABELS.map((hour) => (
            <span key={hour} style={{ left: `${(hour / 24) * 100}%` }}>
              {String(hour).padStart(2, "0")}
            </span>
          ))}
          <span className="ana-tt-hours-end">24</span>
        </div>
      </div>

      {rows.map((day) => {
        const start = day.from;
        const end = dayEnd(start);
        const span = end - start;
        const pct = (at: number) => `${((Math.min(Math.max(at, start), end) - start) / span) * 100}%`;
        const width = (block: StateInterval) => `${((block.to - block.from) / span) * 100}%`;
        const today = start === todayStart;
        const label = today ? t.today : `${fmtWeekday(start)} ${fmtDay(start)}`;
        // Drawn in this order, so an alarm sits on top of a camera outage, which sits on top of "off".
        // Silence goes on top of all of them: while the Pi is quiet, none of the rest is known.
        const blocks = [
          ...disarmedIntervals(events, day),
          ...alarmIntervals(alerts, "camera_offline", day),
          ...alarmIntervals(alerts, "empty", day),
          ...contactGaps(events, day, now),
        ];

        return (
          <div key={start} className="ana-tt-row">
            <span className="ana-tt-label">{label}</span>
            <div className="ana-tt-track">
              {/* OK runs from the Pi's first report to the end of the day, or to now on today: the rest has not happened. */}
              {since !== null && since < end ? <div className="ana-tt-run" style={{ left: pct(since), right: today ? `calc(100% - ${pct(now)})` : 0 }} /> : null}
              {[6, 12, 18].map((hour) => (
                <i key={hour} className="ana-tt-grid" style={{ left: `${(hour / 24) * 100}%` }} />
              ))}
              {today ? <div className="ana-tt-now" style={{ left: pct(now) }} /> : null}
              {blocks.map((block, index) => (
                <div
                  key={`${block.kind}-${index}`}
                  className={`ana-tt-block ana-tt-${block.kind}`}
                  style={{ left: pct(block.from), width: width(block) }}
                  title={describe(block, label, start, end)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <ul className="ana-tt-legend">
        <li>
          <i className="ana-tt-swatch ana-tt-ok" /> {t.legend.ok}
        </li>
        <li>
          <i className="ana-tt-swatch ana-tt-empty" /> {t.legend.empty}
        </li>
        <li>
          <i className="ana-tt-swatch ana-tt-camera" /> {t.legend.camera}
        </li>
        <li>
          <i className="ana-tt-swatch ana-tt-disarmed" /> {t.legend.disarmed}
        </li>
        <li>
          <i className="ana-tt-swatch ana-tt-nocontact" /> {t.legend.noContact}
        </li>
        <li>
          <i className="ana-tt-swatch ana-tt-nodata" /> {t.legend.noData}
        </li>
      </ul>
    </div>
  );
}

// Midnight after the given midnight, so a day that changes clocks still spans the whole row.
function dayEnd(start: number) {
  return startOfDay(start + 36 * HOUR);
}
