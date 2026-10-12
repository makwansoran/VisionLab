import { useEffect, useMemo, useState } from "react";
import { fmtClock, fmtDay, fmtDuration, fmtWeekday } from "../analyse/format";
import { dayBuckets, lastDays, type Period } from "../analyse/periods";
import { DATA_SOURCE, startSiloBridge } from "../analyse/source";
import { t } from "../analyse/strings";
import {
  alarmsPerBucket,
  coverage,
  currentStatus,
  emptyMsPerBucket,
  emptyTime,
  hourBuckets,
  responseTime,
  storyline,
  todayPeriod,
  voiceCounts,
} from "../analyse/summary";
import { useBridgeStatus, useNow, useSiloData } from "../hooks/useSilo";
import { AnalyseBars } from "./AnalyseBars";
import { AnalyseStatus } from "./AnalyseStatus";
import { AnalyseStory } from "./AnalyseStory";
import { AnalyseTimetable } from "./AnalyseTimetable";

type Span = "today" | "days7" | "days30";

const SPANS: readonly Span[] = ["today", "days7", "days30"];

export function AnalysePanel() {
  const { events, alerts } = useSiloData();
  const bridge = useBridgeStatus();
  const [span, setSpan] = useState<Span>("today");
  const tick = useNow(30_000);
  // The period must reach the newest record, not just the last clock tick.
  const newest = events.length > 0 ? Date.parse(events[events.length - 1].receivedAt) : 0;
  const now = Math.max(tick, newest);
  const days = span === "today" ? 1 : span === "days7" ? 7 : 30;

  // Polling runs only while the tab is open; the cleanup stops it.
  useEffect(() => startSiloBridge(), []);

  const period = useMemo<Period>(() => (span === "today" ? todayPeriod(now) : lastDays(days, now)), [span, days, now]);
  const dayRows = useMemo(() => dayBuckets(days, now), [days, now]);
  const buckets = useMemo(() => (span === "today" ? hourBuckets(now) : dayRows), [span, now, dayRows]);
  const status = useMemo(() => currentStatus(events, alerts, now), [events, alerts, now]);
  const time = useMemo(() => emptyTime(alerts, period), [alerts, period]);
  const response = useMemo(() => responseTime(alerts, period), [alerts, period]);
  const voice = useMemo(() => voiceCounts(events, period), [events, period]);
  const counts = useMemo(() => alarmsPerBucket(alerts, buckets), [alerts, buckets]);
  const emptyMs = useMemo(() => emptyMsPerBucket(alerts, buckets), [alerts, buckets]);
  const story = useMemo(() => storyline(events, alerts, period, now), [events, alerts, period, now]);
  const cover = useMemo(() => coverage(events, alerts, period, now), [events, alerts, period, now]);
  const total = counts.reduce((sum, count) => sum + count, 0);
  // When the Pi first reported. Before that a day has no data, not an "OK".
  const since = useMemo(() => {
    const first = events.find((event) => event.source === "edge");
    return first ? Date.parse(first.at) : null;
  }, [events]);

  // Labels: the clock today, the weekday over a week, every fifth date over a month.
  const bucketLabel = (index: number) => {
    const from = buckets[index].from;
    if (span === "today") return fmtClock(from);
    if (span === "days7") return fmtWeekday(from);
    return fmtDay(from);
  };
  // Every fifth date over a month and every third hour today, so the axis stays readable at the smallest window.
  const sparseLabel = (index: number) => ((span === "days30" && index % 5 !== 0) || (span === "today" && index % 3 !== 0) ? "" : bucketLabel(index));

  // What ate the unwatched time, worst first, or "the whole period" when nothing did.
  const unwatched = [
    [cover.noContactMs, t.coverage.noContact],
    [cover.cameraDownMs, t.coverage.camera],
    [cover.disarmedMs, t.coverage.off],
  ] as const;
  const coverageSub = unwatched
    .filter(([ms]) => ms >= 60_000)
    .map(([ms, text]) => text(fmtDuration(ms)))
    .join(" · ");

  return (
    <main className="home analyse" aria-label="Analyse">
      <header className="home-head">
        <div>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="page-seg" role="group" aria-label={t.period}>
          {SPANS.map((name) => (
            <button key={name} type="button" className={span === name ? "active" : undefined} aria-pressed={span === name} onClick={() => setSpan(name)}>
              {t[name]}
            </button>
          ))}
        </div>
      </header>
      {DATA_SOURCE === "none" ? (
        <p className="home-empty">{t.notConnected}</p>
      ) : events.length === 0 ? (
        <p className="home-empty">{t.noData}</p>
      ) : (
        <div className="ana-body">
          <AnalyseStatus status={status} now={now} />

          <h2 className="ana-h2">{t[span]}</h2>
          <div className="ana-tiles">
            <Tile label={t.tiles.empties} value={String(total)} help={t.tileHelp.empties} />
            <Tile
              label={t.tiles.emptyTime}
              value={time.totalMs > 0 ? fmtDuration(time.totalMs) : "-"}
              sub={time.longestMs > 0 ? t.longest(fmtDuration(time.longestMs)) : undefined}
              help={t.tileHelp.emptyTime}
            />
            <Tile
              label={t.tiles.response}
              value={response.medianMs !== null ? fmtDuration(response.medianMs) : "-"}
              sub={response.count > 0 ? t.responseOf(response.count) : undefined}
              help={t.tileHelp.response}
            />
            <Tile
              label={t.tiles.voice}
              value={voice.sent + voice.failed > 0 ? String(voice.sent) : "-"}
              sub={voice.failed > 0 ? t.voiceFailed(voice.failed) : voice.sent > 0 ? t.voiceAll : t.none}
              critical={voice.failed > 0}
              help={t.tileHelp.voice}
            />
            <Tile
              label={t.tiles.coverage}
              value={cover.share === null ? "-" : `${Math.round(cover.share * 100)}%`}
              sub={cover.share === null ? undefined : coverageSub || t.coverage.whole}
              warn={coverageSub !== ""}
              help={t.tileHelp.coverage}
            />
          </div>

          <h2 className="ana-h2">{t.timeline}</h2>
          <AnalyseTimetable days={dayRows} now={now} since={since} alerts={alerts} events={events} />

          <h2 className="ana-h2">{span === "today" ? t.perHour : t.perDay}</h2>
          <AnalyseBars
            counts={counts}
            labels={buckets.map((_, index) => sparseLabel(index))}
            describe={(index) => `${bucketLabel(index)} · ${counts[index]} ${t.tiles.empties.toLowerCase()} · ${emptyMs[index] > 0 ? fmtDuration(emptyMs[index]) : t.none}`}
          />

          <details className="ana-details">
            <summary>{t.showTable}</summary>
            <table className="ana-table">
              <thead>
                <tr>
                  <th>{t.columns.when}</th>
                  <th>{t.columns.empties}</th>
                  <th>{t.columns.emptyTime}</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((_, index) => (
                  <tr key={index}>
                    <td>{bucketLabel(index)}</td>
                    <td>{counts[index]}</td>
                    <td>{emptyMs[index] > 0 ? fmtDuration(emptyMs[index]) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <h2 className="ana-h2">{t.story}</h2>
          <AnalyseStory items={story} now={now} grouped={span !== "today"} />
        </div>
      )}
      {/* A failed fetch still counts as a check, so the error always has a time next to it. */}
      {bridge && bridge.lastPollAt !== null ? (
        <p className="ana-muted">
          {t.lastChecked(fmtClock(bridge.lastPollAt))}
          {bridge.error ? <span className="ana-warn"> · {t.checkFailed(bridge.error.includes("HTTP") ? bridge.error : t.noAnswer)}</span> : null}
        </p>
      ) : null}
    </main>
  );
}

function Tile({ label, value, sub, critical, warn, help }: { label: string; value: string; sub?: string; critical?: boolean; warn?: boolean; help: string }) {
  return (
    <div className={critical ? "ana-tile ana-tile-critical" : warn ? "ana-tile ana-tile-warn" : "ana-tile"} title={help}>
      <div className="ana-tile-label">{label}</div>
      <div className="ana-tile-value">{value}</div>
      {sub ? <div className="ana-tile-sub">{sub}</div> : null}
    </div>
  );
}
