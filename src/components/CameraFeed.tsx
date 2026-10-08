import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Feed } from "../hooks/useFeeds";
import { loadVision, visionStats, type VisionStats } from "../labels/db";
import type { VisionRecord } from "../labels/types";

export function CameraCanvas({
  feeds,
  start,
  onCapture,
}: {
  feeds: { feed: Feed; name: string }[];
  start: (id: string) => Promise<void>;
  onCapture: (cameraId: string, blob: Blob, width: number, height: number) => Promise<void>;
}) {
  const feed = feeds[0];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(true);
  const live = feed?.feed.status === "live";
  const fps = useFeedFps(video, live && !paused);

  const capture = async () => {
    const video = videoRef.current;
    const cameraId = feed?.feed.cameraId;
    if (!feed || !cameraId || !video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    await onCapture(cameraId, blob, canvas.width, canvas.height);
  };

  useEffect(() => {
    if (!video) return;
    const sync = () => setPaused(video.paused);
    sync();
    video.addEventListener("pause", sync);
    video.addEventListener("play", sync);
    return () => {
      video.removeEventListener("pause", sync);
      video.removeEventListener("play", sync);
    };
  }, [video]);

  const togglePlayback = () => {
    if (!feed) return;
    if (!live || !video) {
      void start(feed.feed.id);
      return;
    }
    if (video.paused) void video.play();
    else video.pause();
  };

  return (
    <main className="stage vision-canvas" aria-label="Canvas">
      {feed && <h1 className="canvas-name">{feed.name}</h1>}
      <div className="canvas-row">
      {feed && (
        <div className="canvas-feed-col">
          <article className="feed-window is-fixed">
            <div className="feed-window-body">
              <FeedTile
                feed={feed.feed}
                onRetry={() => void start(feed.feed.id)}
                bindVideo={(element) => {
                  videoRef.current = element;
                  setVideo(element);
                }}
              />
            </div>
            {fps !== null && <span className="canvas-fps">{fps} fps</span>}
            <button type="button" className="canvas-capture" onClick={() => void capture()}>
              Capture
            </button>
          </article>
        </div>
      )}
      <VisionAnalytics cameraId={feed?.feed.cameraId ?? null} />
      </div>
      {feed && (
        <button type="button" className="canvas-player" aria-label={paused ? "Start" : "Pause"} onClick={togglePlayback}>
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
      )}
    </main>
  );
}

function VisionAnalytics({ cameraId }: { cameraId: string | null }) {
  const [vision, setVision] = useState<VisionRecord | null>(null);
  const [stats, setStats] = useState<VisionStats>({ frames: 0, labeled: 0, marks: {} });

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
    <aside className="canvas-analytics" aria-label="Analytics">
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
      </section>
    </aside>
  );
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

export function FixedFeeds({
  feeds,
  start,
  bindVideo,
  footer,
}: {
  feeds: { feed: Feed; name: string }[];
  start: (id: string) => Promise<void>;
  bindVideo?: (id: string, element: HTMLVideoElement | null) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="training-stage">
      {feeds.map((item, index) => (
        <section key={item.feed.id} className="training-feed">
          <header>{item.name}</header>
          <FeedTile feed={item.feed} onRetry={() => void start(item.feed.id)} bindVideo={bindVideo ? (element) => bindVideo(item.feed.id, element) : undefined} />
          {index === feeds.length - 1 && footer}
        </section>
      ))}
      {feeds.length === 0 && footer}
    </div>
  );
}

export function CameraFeed({
  feeds,
  start,
  remove,
  embedded = false,
}: {
  feeds: Feed[];
  start: (id: string) => Promise<void>;
  remove: (id: string) => void;
  embedded?: boolean;
}) {
  const [primary, ...rest] = feeds;
  const className = [embedded ? "project-camera" : "stage", rest.length > 0 ? "multi" : ""].filter(Boolean).join(" ");
  const Tag = embedded ? "div" : "main";

  return (
    <Tag className={className} aria-label="Camera">
      {primary && <FeedTile feed={primary} primary onRetry={() => void start(primary.id)} />}
      {rest.length > 0 && (
        <div className="feed-rail">
          {rest.map((feed) => (
            <FeedTile
              key={feed.id}
              feed={feed}
              onRetry={() => void start(feed.id)}
              onRemove={() => remove(feed.id)}
            />
          ))}
        </div>
      )}
    </Tag>
  );
}

function useFeedFps(video: HTMLVideoElement | null, live: boolean) {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    if (!live || !video) {
      setFps(null);
      return;
    }
    const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const reported = track?.getSettings().frameRate;
    setFps(reported ? Math.round(reported) : null);
    if (typeof video.requestVideoFrameCallback !== "function") return;

    let frames = 0;
    let last = performance.now();
    let handle = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      frames += 1;
      const now = performance.now();
      const elapsed = now - last;
      if (elapsed >= 1000) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback(handle);
    };
  }, [live, video]);

  return fps;
}

function fitTrainingFrame(video: HTMLVideoElement) {
  const frame = video.closest(".training-feed");
  const picture = video.parentElement;
  if (!(frame instanceof HTMLElement) || !(picture instanceof HTMLElement)) return;
  if (!video.videoWidth || !video.videoHeight) return;
  picture.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
}

function FeedTile({
  feed,
  primary = false,
  onRetry,
  onRemove,
  bindVideo,
}: {
  feed: Feed;
  primary?: boolean;
  onRetry: () => void;
  onRemove?: () => void;
  bindVideo?: (element: HTMLVideoElement | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bindRef = useRef(bindVideo);
  const live = feed.status === "live";
  bindRef.current = bindVideo;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = feed.stream;
    if (feed.stream) void video.play();
    fitTrainingFrame(video);
    bindRef.current?.(video);
    return () => bindRef.current?.(null);
  }, [feed.stream]);

  return (
    <section className={primary ? "feed primary" : "feed"}>
      <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={(event) => fitTrainingFrame(event.currentTarget)} />
      {onRemove && (
        <button type="button" className="feed-remove" aria-label="Remove feed" onClick={onRemove}>
          ×
        </button>
      )}
      {!live && (
        <div className="feed-empty">
          <p>
            {feed.status === "error"
              ? "The camera did not start"
              : feed.status === "starting"
                ? "Opening camera"
                : "Camera"}
          </p>
          {feed.error && <p className="stage-error">{feed.error}</p>}
          {feed.status !== "starting" && (
            <button type="button" className="start" onClick={onRetry}>
              Start camera
            </button>
          )}
        </div>
      )}
    </section>
  );
}
