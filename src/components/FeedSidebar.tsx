import { useEffect, useState, type ReactNode } from "react";
import { EVENT_COLORS, markFeedEventsSeen, type FeedEvent, type FeedEventKind } from "../feedEvents";
import { loadVision, visionStats, type VisionStats } from "../labels/db";
import type { VisionRecord } from "../labels/types";

const ALERT_KINDS: readonly FeedEventKind[] = ["empty", "alert", "camera"];
const HOUR = 3_600_000;
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function FeedSidebar({ cameraId, events, onTrain }: { cameraId: string | null; events: readonly FeedEvent[]; onTrain: () => void }) {
  const [vision, setVision] = useState<VisionRecord | null>(null);
  const [stats, setStats] = useState<VisionStats>({ frames: 0, labeled: 0, marks: {} });
  const recent = [...events].reverse().slice(0, 10);
  const cutoff = Date.now() - HOUR;
  const alerts = events.filter((event) => !event.seen && ALERT_KINDS.includes(event.kind) && Date.parse(event.at) >= cutoff).reverse();

  useEffect(() => {
    if (!cameraId) return;
    let live = true;
    Promise.all([loadVision(cameraId), visionStats(cameraId)]).then(([record, next]) => {
      if (!live) return;
      setVision(record);
      setStats(next);
    });
    return () => {
      live = false;
    };
  }, [cameraId]);

  return (
    <aside className="canvas-analytics" aria-label="Feed">
      <section className="canvas-card">
        <h2>Watching</h2>
        <p>{vision?.scope.trim() || "Scope is not set yet."}</p>
        {vision && vision.rules.length > 0 && (
          <ul>
            {vision.rules.map((rule) => (
              <li key={rule.id}>
                <span>
                  {vision.classes.find((item) => item.id === rule.classId)?.name ?? "Removed class"} → {rule.action}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Fold title="Notifications" count={recent.length}>
        {recent.length === 0 ? <p>Nothing has happened yet.</p> : <EventList events={recent} />}
      </Fold>
      <Fold title="Alerts" count={alerts.length}>
        {alerts.length === 0 ? (
          <p>No alerts.</p>
        ) : (
          <>
            <EventList events={alerts} />
            {cameraId && (
              <button type="button" className="text-btn" onClick={() => markFeedEventsSeen(cameraId)}>
                Clear
              </button>
            )}
          </>
        )}
      </Fold>
      <section className="canvas-card">
        <h2>Training</h2>
        <p>
          {stats.frames} frames · {stats.labeled} labeled
        </p>
        {vision && vision.classes.length > 0 && (
          <ul>
            {vision.classes.map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <span>{stats.marks[item.id] ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="feed-side-train" onClick={onTrain}>
          <IconTrain />
          Train
        </button>
      </section>
    </aside>
  );
}

// Closed by default; the count says whether there is anything to open it for.
function Fold({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="canvas-card canvas-fold">
      <summary>
        <h2>{title}</h2>
        <span>{count}</span>
        <IconChevron />
      </summary>
      <div className="canvas-fold-body">{children}</div>
    </details>
  );
}

function EventList({ events }: { events: readonly FeedEvent[] }) {
  return (
    <ul className="feed-side-list">
      {events.map((event) => (
        <li key={event.id}>
          <i className="feed-dot" style={{ background: EVENT_COLORS[event.kind] }} />
          <span>{event.text}</span>
          <span className="feed-side-time">{clock.format(Date.parse(event.at))}</span>
        </li>
      ))}
    </ul>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IconTrain() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M9 20H4v-5" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}
