import { useCallback, useEffect, useRef, useState } from "react";
import { resolutionSize, type Resolution } from "../settings";

export type FeedStatus = "idle" | "starting" | "live" | "error";

export interface Feed {
  id: string;
  cameraId: string | null;
  model: string;
  deviceId: string | null;
  name: string;
  status: FeedStatus;
  error: string | null;
  stream: MediaStream | null;
  videoUrl?: string;
}

function createId() {
  return crypto.randomUUID();
}

function blankFeed(model: string, deviceId: string | null, name: string): Feed {
  return { id: createId(), cameraId: null, model, deviceId, name, status: "idle", error: null, stream: null };
}

export async function openCamera(deviceId?: string, resolution: Resolution = "720") {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This window cannot open a camera.");
  }
  const size = resolutionSize(resolution);
  const attempts: MediaTrackConstraints[] = deviceId
    ? [{ deviceId: { exact: deviceId } }, { deviceId: { ideal: deviceId } }, { deviceId }]
    : [{}];
  let last: unknown;
  for (const [index, video] of attempts.entries()) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      const track = stream.getVideoTracks()[0];
      const opened = track?.getSettings().deviceId;
      if (track && (!deviceId || !opened || opened === deviceId || index === attempts.length - 1)) {
        try {
          await track.applyConstraints({ width: { ideal: size.width }, height: { ideal: size.height } });
        } catch {
          /* The camera is already running. Keep this picture if the size cannot change. */
        }
        return stream;
      }
      stopStream(stream);
    } catch (caught) {
      last = caught;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw last instanceof Error ? last : new Error("Could not start video source");
}

async function acquire(existing: Feed[], resolution: Resolution) {
  const live = existing.filter((feed) => feed.stream);
  const used = new Set(
    live.flatMap((feed) => feed.stream!.getVideoTracks().map((track) => track.getSettings().deviceId ?? "")),
  );

  if (live.length > 0 && navigator.mediaDevices?.enumerateDevices) {
    const listed = await navigator.mediaDevices.enumerateDevices();
    const next = listed.find((device) => device.kind === "videoinput" && device.deviceId && !used.has(device.deviceId));
    if (next) {
      try {
        return await openCamera(next.deviceId, resolution);
      } catch {
        return live[0].stream!.clone();
      }
    }
    return live[0].stream!.clone();
  }

  return openCamera(undefined, resolution);
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useFeeds(
  write: (text: string) => void,
  options: { autoStart: boolean; resolution: Resolution },
) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const feedsRef = useRef(feeds);
  const aliveRef = useRef(true);
  const generationRef = useRef(0);
  const writeRef = useRef(write);
  const optionsRef = useRef(options);
  writeRef.current = write;
  optionsRef.current = options;

  const log = (text: string) => writeRef.current(text);

  const commit = useCallback((next: Feed[]) => {
    feedsRef.current = next;
    setFeeds(next);
  }, []);

  const start = useCallback(
    async (id: string, generation?: number) => {
      const current = feedsRef.current.find((feed) => feed.id === id);
      stopStream(current?.stream ?? null);
      commit(feedsRef.current.map((feed) => (feed.id === id ? { ...feed, status: "starting", error: null, stream: null } : feed)));

      try {
        const resolution = optionsRef.current.resolution;
        const stream = current?.deviceId
          ? await openCamera(current.deviceId, resolution)
          : await acquire(feedsRef.current.filter((feed) => feed.id !== id), resolution);
        const stale = generation !== undefined && generation !== generationRef.current;
        if (!aliveRef.current || stale || !feedsRef.current.some((feed) => feed.id === id)) {
          stopStream(stream);
          return;
        }
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        const size = settings?.width && settings?.height ? ` ${settings.width}×${settings.height}` : "";
        log(`Camera live${size}`);
        commit(
          feedsRef.current.map((feed) => (feed.id === id ? { ...feed, status: "live", error: null, stream } : feed)),
        );
      } catch (caught) {
        const stale = generation !== undefined && generation !== generationRef.current;
        if (!aliveRef.current || stale || !feedsRef.current.some((feed) => feed.id === id)) return;
        const message = caught instanceof Error ? caught.message : "Camera unavailable";
        log(`Camera error: ${message}`);
        commit(
          feedsRef.current.map((feed) =>
            feed.id === id
              ? {
                  ...feed,
                  status: "error",
                  stream: null,
                  error: message,
                }
              : feed,
          ),
        );
      }
    },
    [commit],
  );

  const add = useCallback((model: string, deviceId?: string, name?: string, stream?: MediaStream, cameraId?: string) => {
    const running = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
    const feed: Feed = {
      ...blankFeed(model, deviceId || null, name ?? ""),
      cameraId: cameraId ?? null,
      status: running ? "live" : "idle",
      stream: running ? stream ?? null : null,
    };
    log(running ? "Camera live" : "Feed added");
    commit([...feedsRef.current, feed]);
    if (!running && optionsRef.current.autoStart) void start(feed.id);
    return feed.id;
  }, [commit, start]);

  const addVideo = useCallback((name: string, videoUrl: string, cameraId: string) => {
    const feed: Feed = {
      ...blankFeed("Video file", null, name),
      cameraId,
      status: "live",
      stream: null,
      videoUrl,
    };
    log("Video feed added");
    commit([...feedsRef.current, feed]);
    return feed.id;
  }, [commit]);

  const setModel = useCallback((id: string, model: string) => {
    commit(feedsRef.current.map((feed) => (feed.id === id ? { ...feed, model } : feed)));
  }, [commit]);

  const rename = useCallback((cameraId: string, name: string) => {
    const next = name.trim();
    if (!next) return;
    commit(feedsRef.current.map((feed) => (feed.cameraId === cameraId ? { ...feed, name: next } : feed)));
  }, [commit]);

  const remove = useCallback(
    (id: string) => {
      const feed = feedsRef.current.find((item) => item.id === id);
      if (!feed) return;
      stopStream(feed.stream);
      if (feed.videoUrl) URL.revokeObjectURL(feed.videoUrl);
      log("Feed removed");
      commit(feedsRef.current.filter((item) => item.id !== id));
    },
    [commit],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      feedsRef.current.forEach((feed) => {
        stopStream(feed.stream);
        if (feed.videoUrl) URL.revokeObjectURL(feed.videoUrl);
      });
    };
  }, []);

  return { feeds, start, add, addVideo, setModel, rename, remove };
}
