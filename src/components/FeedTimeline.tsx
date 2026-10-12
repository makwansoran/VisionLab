import { useRef } from "react";
import { EVENT_COLORS, EVENT_NAMES, type FeedEvent, type FeedEventKind } from "../feedEvents";
import type { HistoryPiece } from "../history";
import { fraction, spikes, timeAt, type TimeRange } from "../timeline";

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function FeedTimeline({
  events,
  pieces,
  now,
  range,
  playhead,
  paused,
  onTogglePlay,
  onSeek,
  onLive,
}: {
  events: readonly FeedEvent[];
  pieces: readonly HistoryPiece[];
  now: number;
  range: TimeRange;
  playhead: number | null;
  paused: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onLive: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const live = playhead === null;
  const marks = events
    .map((event) => ({ ...event, time: Date.parse(event.at) }))
    .filter((event) => event.time >= range.from && event.time <= range.to);
  const line = spikes(
    marks.map((event) => ({ id: event.id, at: event.at, color: EVENT_COLORS[event.kind] })),
    range,
  ).map((spike) => ({ ...spike, kind: marks.find((event) => event.id === spike.id)?.kind ?? "camera" }));
  const kinds = [...new Set(marks.map((event) => event.kind))] as FeedEventKind[];
  const left = (time: number) => `${fraction(time, range) * 100}%`;

  const seekFrom = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    onSeek(timeAt((clientX - box.left) / box.width, range));
  };

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button type="button" className="timeline-play" aria-label={paused ? "Play" : "Pause"} onClick={onTogglePlay}>
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
        <button type="button" className={live ? "timeline-live active" : "timeline-live"} onClick={onLive}>
          Live
        </button>
        <span className="timeline-clock">{clock.format(playhead ?? now)}</span>
      </div>
      <div
        ref={trackRef}
        className="timeline-track"
        role="slider"
        aria-label="Go back in time"
        aria-valuemin={range.from}
        aria-valuemax={range.to}
        aria-valuenow={playhead ?? now}
        tabIndex={0}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFrom(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging.current) seekFrom(event.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onKeyDown={(event) => {
          const step = (range.to - range.from) / 60;
          if (event.key === "ArrowLeft") onSeek((playhead ?? now) - step);
          if (event.key === "ArrowRight") onSeek(Math.min(now, (playhead ?? now) + step));
        }}
      >
        {pieces.map((piece) => (
          <div key={piece.from} className="timeline-recorded" style={{ left: left(piece.from), width: `${(fraction(piece.to, range) - fraction(piece.from, range)) * 100}%` }} />
        ))}
        {marks.map((event) => (
          <i key={event.id} className="timeline-mark" style={{ left: left(event.time), background: EVENT_COLORS[event.kind] }} title={`${clock.format(event.time)} · ${event.text}`} />
        ))}
        <div className="timeline-playhead" style={{ left: left(playhead ?? now) }} />
      </div>
      <div className="timeline-axis">
        <span>{clock.format(range.from)}</span>
        <span>{clock.format((range.from + range.to) / 2)}</span>
        <span>now</span>
      </div>
      <div className="timeline-graph" aria-label="Events over time">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {kinds.map((kind) => (
              <linearGradient key={kind} id={`spike-${kind}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={EVENT_COLORS[kind]} stopOpacity="0.55" />
                <stop offset="1" stopColor={EVENT_COLORS[kind]} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          <line className="timeline-grid" x1="0" y1="48" x2="1000" y2="48" />
          <line className="timeline-base" x1="0" y1="84" x2="1000" y2="84" />
          {line.map((spike) => (
            <path key={`${spike.id}-fill`} className="timeline-spike-fill" d={`${bump(spike.x * 1000)} Z`} fill={`url(#spike-${spike.kind})`} />
          ))}
          {line.map((spike) => (
            <path key={spike.id} className="timeline-spike" d={bump(spike.x * 1000)} style={{ stroke: spike.color }} />
          ))}
          <line className="timeline-graph-playhead" x1={fraction(playhead ?? now, range) * 1000} y1="0" x2={fraction(playhead ?? now, range) * 1000} y2="100" />
        </svg>
      </div>
      {kinds.length > 0 && (
        <ul className="timeline-legend">
          {kinds.map((kind) => (
            <li key={kind}>
              <i style={{ background: EVENT_COLORS[kind] }} />
              {EVENT_NAMES[kind]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A smooth bump from the baseline to the peak and back, in graph units (1000 wide, 100 tall).
function bump(x: number) {
  const w = 9;
  return `M ${x - w},84 C ${x - w / 2},84 ${x - w / 3},12 ${x},12 C ${x + w / 3},12 ${x + w / 2},84 ${x + w},84`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h3.5v14H7V5Z" />
      <path d="M13.5 5H17v14h-3.5V5Z" />
    </svg>
  );
}
