import { useEffect, useRef, useState, type ReactNode } from "react";
import { addFeedEvent } from "../feedEvents";
import { HISTORY_KEEP_MS, pieceAt } from "../history";
import type { Feed } from "../hooks/useFeeds";
import { useFeedEvents } from "../hooks/useFeedEvents";
import { useFeedHistory } from "../hooks/useFeedHistory";
import { isTestCamera, startTestCycle } from "../testCamera";
import { timelineRange } from "../timeline";
import { FeedSidebar } from "./FeedSidebar";
import { FeedTimeline } from "./FeedTimeline";

export function CameraCanvas({
  feeds,
  start,
  onCapture,
  onTrain,
}: {
  feeds: { feed: Feed; name: string }[];
  start: (id: string) => Promise<void>;
  onCapture: (cameraId: string, blob: Blob, width: number, height: number) => Promise<void>;
  onTrain: () => void;
}) {
  const feed = feeds[0];
  const cameraId = feed?.feed.cameraId ?? null;
  const deviceId = feed?.feed.deviceId ?? null;
  const error = feed?.feed.error ?? null;
  const status = feed?.feed.status ?? "idle";
  const live = status === "live";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const lastStatus = useRef(status);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(true);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  // Null while watching live. Otherwise the moment to replay, counted so a second seek to the same moment still lands.
  const [seek, setSeek] = useState<{ time: number; n: number } | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const events = useFeedEvents(cameraId);
  const { pieces, now } = useFeedHistory(feed?.feed.id ?? null, live ? feed.feed.stream : null);
  const range = timelineRange(now, HISTORY_KEEP_MS);
  const piece = seek ? pieceAt(pieces, seek.time) : null;
  const fps = useFeedFps(video, live && !paused && seek === null);

  const capture = async () => {
    const video = videoRef.current;
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
    addFeedEvent(cameraId, "capture");
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

  // The feed's own troubles go into the log next to the silo events.
  useEffect(() => {
    const previous = lastStatus.current;
    lastStatus.current = status;
    if (!cameraId || previous === status) return;
    if (status === "error") addFeedEvent(cameraId, "camera", error ? `The camera did not start: ${error}` : "The camera did not start");
    else if (status === "live" && previous === "error") addFeedEvent(cameraId, "camera", "Camera back");
  }, [cameraId, status, error]);

  // The Testing camera acts out a silo cycle, so the tracker has something to show before Argus runs.
  useEffect(() => {
    if (!cameraId || !live || !isTestCamera(deviceId)) return;
    return startTestCycle((step) => addFeedEvent(cameraId, step));
  }, [cameraId, live, deviceId]);

  useEffect(() => {
    const element = playbackRef.current;
    if (!seek || !piece || !element) return;
    if (element.dataset.url !== piece.url) {
      element.src = piece.url;
      element.dataset.url = piece.url;
    }
    element.currentTime = Math.max(0, (seek.time - piece.from) / 1000);
    void element.play();
  }, [seek, piece]);

  const seekTo = (time: number) => {
    setSeek((current) => ({ time, n: (current?.n ?? 0) + 1 }));
    setPlayhead(time);
  };

  const goLive = () => {
    setSeek(null);
    setPlayhead(null);
    setPlaybackPaused(false);
  };

  const togglePlayback = () => {
    if (seek) {
      const element = playbackRef.current;
      if (!element) return;
      if (element.paused) void element.play();
      else element.pause();
      return;
    }
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
          <div className="canvas-feed-col has-timeline">
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
                {seek &&
                  (piece ? (
                    <video
                      ref={playbackRef}
                      className="feed-playback"
                      muted
                      playsInline
                      onPlay={() => setPlaybackPaused(false)}
                      onPause={() => setPlaybackPaused(true)}
                      onTimeUpdate={(event) => setPlayhead(piece.from + event.currentTarget.currentTime * 1000)}
                      onEnded={() => {
                        const next = pieces.find((item) => item.from >= piece.to);
                        if (next) seekTo(next.from);
                        else goLive();
                      }}
                    />
                  ) : (
                    <p className="feed-playback-note">Nothing recorded at this time</p>
                  ))}
              </div>
              {fps !== null && <span className="canvas-fps">{fps} fps</span>}
              <button type="button" className="canvas-capture" onClick={() => void capture()}>
                Capture
              </button>
            </article>
            <FeedTimeline
              events={events}
              pieces={pieces}
              now={now}
              range={range}
              playhead={playhead}
              paused={seek ? playbackPaused : paused}
              onTogglePlay={togglePlayback}
              onSeek={seekTo}
              onLive={goLive}
            />
          </div>
        )}
        <FeedSidebar cameraId={cameraId} events={events} onTrain={onTrain} />
      </div>
    </main>
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
  allowPrimaryRemove = false,
  dashboardLayout = false,
}: {
  feeds: Feed[];
  start: (id: string) => Promise<void>;
  remove: (id: string) => void;
  embedded?: boolean;
  allowPrimaryRemove?: boolean;
  dashboardLayout?: boolean;
}) {
  const [primary, ...rest] = feeds;
  const dashboardCountClass = feeds.length > 9 ? "feed-count-many" : `feed-count-${feeds.length}`;
  const className = [embedded ? "project-camera" : "stage", rest.length > 0 ? "multi" : "", dashboardLayout ? `dashboard-layout ${dashboardCountClass}` : ""].filter(Boolean).join(" ");
  const Tag = embedded ? "div" : "main";

  return (
    <Tag className={className} aria-label="Camera">
      {primary && <FeedTile feed={primary} primary onRetry={() => void start(primary.id)} onRemove={allowPrimaryRemove ? () => remove(primary.id) : undefined} />}
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

export function FeedTile({
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
  const [paused, setPaused] = useState(false);
  const live = feed.status === "live";
  bindRef.current = bindVideo;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.removeAttribute("src");
    video.srcObject = feed.stream;
    if (feed.videoUrl) video.src = feed.videoUrl;
    if (feed.stream || feed.videoUrl) void video.play().catch(() => undefined);
    const sync = () => setPaused(video.paused);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    sync();
    fitTrainingFrame(video);
    bindRef.current?.(video);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      bindRef.current?.(null);
    };
  }, [feed.stream, feed.videoUrl]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video || !live) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <section className={primary ? "feed primary" : "feed"}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        loop={Boolean(feed.videoUrl)}
        onClick={togglePlayback}
        onLoadedMetadata={(event) => fitTrainingFrame(event.currentTarget)}
      />
      {live && <button type="button" className="feed-play-toggle" aria-label={paused ? `Play ${feed.name}` : `Pause ${feed.name}`} title={paused ? "Play" : "Pause"} onClick={togglePlayback}>
        {paused ? <PlayIcon /> : <PauseIcon />}
      </button>}
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

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>;
}
