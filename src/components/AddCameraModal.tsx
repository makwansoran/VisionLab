import { useEffect, useId, useRef, useState } from "react";
import { openCamera } from "../hooks/useFeeds";
import type { Resolution } from "../settings";

type CameraSource = "device" | "network" | "file";
type NetworkKind = "nvr" | "switch";

function releaseCamera(stream: MediaStream | null) {
  if (!stream) return Promise.resolve();
  const tracks = stream.getTracks();
  tracks.forEach((track) => track.stop());
  return Promise.all(
    tracks.map(
      (track) =>
        new Promise<void>((resolve) => {
          if (track.readyState === "ended") resolve();
          else track.addEventListener("ended", () => resolve(), { once: true });
        }),
    ),
  );
}

function streamUrl(ip: string, username: string, password: string, rtsp: string) {
  const host = ip.trim();
  if (!host) return "";
  const user = username.trim();
  const auth = user ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@` : "";
  const detail = rtsp.trim();
  const tail = /^\d+$/.test(detail) ? `:${detail}` : detail.startsWith("/") ? detail : detail ? `/${detail}` : "";
  return `rtsp://${auth}${host}${tail}`;
}

const sources: { id: CameraSource; label: string; detail: string }[] = [
  { id: "device", label: "This computer", detail: "A built-in or USB camera" },
  { id: "network", label: "Network", detail: "An IP camera or stream URL" },
  { id: "file", label: "Video file", detail: "A recording on this computer" },
];

const systems: Record<NetworkKind, string[]> = {
  nvr: ["Hikvision", "Dahua", "Uniview", "Reolink"],
  switch: ["Cisco", "UniFi", "Netgear", "TP-Link"],
};

export function AddCameraModal({
  onClose,
  onAddDevice,
  resolution,
  purpose = "vision",
  excludedDeviceIds = [],
  excludedVideoFiles = [],
  onAddVideo,
}: {
  onClose: () => void;
  onAddDevice: (model: string, deviceId: string, name: string, stream: MediaStream) => void;
  resolution: Resolution;
  purpose?: "vision" | "dashboard";
  excludedDeviceIds?: string[];
  excludedVideoFiles?: { name: string; size: number; lastModified: number }[];
  onAddVideo?: (file: File) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<CameraSource | null>(null);
  const [kind, setKind] = useState<NetworkKind | null>(null);
  const [system, setSystem] = useState<string | null>(null);
  const [ip, setIp] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameraTry, setCameraTry] = useState(0);
  const [cameraState, setCameraState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const preview = useRef<MediaStream | null>(null);
  const handed = useRef(false);
  const openGate = useRef(Promise.resolve());
  const [dragging, setDragging] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = sources.find((item) => item.id === source) ?? null;
  const total = source === "network" ? 4 : 2;
  const url = streamUrl(ip, username, password, rtsp);
  useEffect(() => {
    if (step !== 2 || source !== "device") return;
    let cancel = false;
    setCameraState("loading");
    setCameraError(null);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("This window cannot list cameras.");
        }
        const read = async () => {
          const listed = await navigator.mediaDevices.enumerateDevices();
          return listed.filter((device) => device.kind === "videoinput" && device.deviceId);
        };
        let found = await read();
        if (found.length === 0 || found.some((device) => !device.label)) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
          await releaseCamera(stream);
          found = await read();
        }
        if (cancel) return;
        const options = found.map((device, index) => ({ id: device.deviceId, label: device.label.trim() || `Camera ${index + 1}` }));
        setCameras(options);
        setCameraId((current) => (current && options.some((item) => item.id === current) ? current : null));
        setCameraState("ready");
      } catch (caught) {
        if (cancel) return;
        setCameras([]);
        setCameraState("error");
        setCameraError(caught instanceof Error ? caught.message : "Could not read the cameras");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [step, source]);

  useEffect(() => {
    return () => {
      if (!handed.current) releaseCamera(preview.current);
    };
  }, []);

  useEffect(() => {
    if (source !== "device" || !cameraId || cameraState !== "ready") return;
    let cancel = false;
    setOpening(true);
    const job = openGate.current.then(async () => {
      await releaseCamera(preview.current);
      preview.current = null;
      if (cancel || handed.current) return;
      const stream = await openCamera(cameraId, resolution);
      if (cancel || handed.current) {
        await releaseCamera(stream);
        return;
      }
      preview.current = stream;
      setCameraError(null);
      setOpening(false);
    });
    openGate.current = job.then(
      () => undefined,
      () => undefined,
    );
    void job.catch((caught) => {
      if (cancel) return;
      setOpening(false);
      setCameraError(caught instanceof Error ? caught.message : "Could not start video source");
    });
    return () => {
      cancel = true;
    };
  }, [cameraId, cameraTry, cameraState, source, resolution]);

  const canContinue =
    (step === 1 && source !== null) ||
    (step === 2 && source === "device" && cameraId !== null && !opening && !cameraError) ||
    (step === 2 && source === "file") ||
    (step === 2 && source === "network" && kind !== null) ||
    (step === 3 && source === "network" && system !== null);
  const heading =
    step === 1
      ? (purpose === "dashboard" ? "Add dashboard feed" : "Add vision")
      : source === "network" && step === 2
        ? "Network"
        : source === "network" && step === 3
          ? "System"
          : source === "network"
            ? (system ?? "Connection")
            : (selected?.label ?? (purpose === "dashboard" ? "Add dashboard feed" : "Add vision"));

  const takeVideo = (file: File | undefined) => {
    if (!file) return;
    const video = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
    if (!video) {
      setFileNote("Choose a video file");
      return;
    }
    if (purpose === "dashboard" && excludedVideoFiles.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) {
      setFileNote("This video is already on the dashboard");
      return;
    }
    setFileNote(null);
    setVideoFile(file);
  };

  const finish = () => {
    if (source === "file" && videoFile && purpose === "dashboard" && onAddVideo) {
      onAddVideo(videoFile);
      onClose();
      return;
    }
    if (source !== "device" || opening) return;
    const camera = cameras.find((item) => item.id === cameraId);
    if (!camera) return;
    const running = preview.current?.getVideoTracks().some((track) => track.readyState === "live") ? preview.current : null;
    setOpening(true);
    setCameraError(null);
    void (running ? Promise.resolve(running) : openCamera(camera.id, resolution))
      .then((stream) => {
        handed.current = true;
        if (preview.current === stream) preview.current = null;
        onAddDevice("Argus 1.0", camera.id, camera.label, stream);
        onClose();
      })
      .catch((caught) => {
        setOpening(false);
        setCameraError(caught instanceof Error ? caught.message : "Could not start video source");
      });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-progress">
          <div className="modal-step">
            <p className="modal-kicker">Step {step} of {total}</p>
            <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step}
            aria-label={`Step ${step} of ${total}`}
          >
            <div className="progress-fill" style={{ width: `${(step / total) * 100}%` }} />
          </div>
        </div>
        <div className="modal-head">
          <h2 id={titleId}>{heading}</h2>
        </div>

        {step === 1 ? (
          <div className="source-list" role="radiogroup" aria-label="Camera source">
            {sources.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={source === item.id}
                className={source === item.id ? "source-option selected" : "source-option"}
                onClick={() => setSource(item.id)}
              >
                <span>{item.label}</span>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
        ) : source === "device" ? (
          cameraState === "loading" || cameraState === "idle" ? (
            <p className="modal-copy">Looking for cameras</p>
          ) : cameraState === "error" ? (
            <p className="modal-copy">{cameraError}</p>
          ) : cameras.length === 0 ? (
            <p className="modal-copy">No camera was found</p>
          ) : (
            <div className="source-list" role="radiogroup" aria-label="Cameras on this computer">
              {cameras.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={cameraId === item.id}
                  aria-disabled={excludedDeviceIds.includes(item.id)}
                  className={`${cameraId === item.id ? "source-option selected" : "source-option"}${excludedDeviceIds.includes(item.id) ? " is-disabled" : ""}`}
                  onClick={() => {
                    if (excludedDeviceIds.includes(item.id)) return;
                    setCameraError(null);
                    setCameraId(item.id);
                    setCameraTry((current) => current + 1);
                  }}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )
        ) : source === "file" ? (
          <div
            className={dragging ? "file-drop over" : "file-drop"}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              takeVideo(event.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              className="file-input"
              type="file"
              hidden
              accept="video/*"
              onChange={(event) => {
                takeVideo(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <p>{videoFile ? videoFile.name : "Drag a video here"}</p>
            {fileNote && <p className="stage-error">{fileNote}</p>}
            <button type="button" className="text-btn" onClick={() => fileInputRef.current?.click()}>
              {videoFile ? "Change file" : "Browse"}
            </button>
          </div>
        ) : source === "network" && step === 2 ? (
          <div className="source-list" role="radiogroup" aria-label="Network kind">
            <button
              type="button"
              role="radio"
              aria-checked={kind === "nvr"}
              className={kind === "nvr" ? "source-option selected" : "source-option"}
              onClick={() => {
                setKind("nvr");
                setSystem(null);
              }}
            >
              <span>NVR</span>
              <span>A recorder on the network</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === "switch"}
              className={kind === "switch" ? "source-option selected" : "source-option"}
              onClick={() => {
                setKind("switch");
                setSystem(null);
              }}
            >
              <span>Switch</span>
              <span>A switch on the network</span>
            </button>
          </div>
        ) : source === "network" && step === 3 && kind ? (
          <div className="source-list" role="radiogroup" aria-label="System">
            {systems[kind].map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={system === item}
                className={system === item ? "source-option selected" : "source-option"}
                onClick={() => setSystem(item)}
              >
                <span>{item}</span>
              </button>
            ))}
          </div>
        ) : source === "network" ? (
          <div className="network-fields">
            <label className="modal-field">
              <span>IP address</span>
              <input value={ip} autoFocus placeholder="192.168.1.10" onChange={(event) => setIp(event.target.value)} />
            </label>
            <label className="modal-field">
              <span>RTSP</span>
              <input
                value={rtsp}
                placeholder="554 or /Streaming/Channels/101"
                onChange={(event) => setRtsp(event.target.value)}
              />
            </label>
            <label className="modal-field">
              <span>Username</span>
              <input value={username} autoComplete="off" onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="modal-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="stream-url">
              <span>Stream URL</span>
              <p>{url || "rtsp://"}</p>
            </div>
          </div>
        ) : null}

        {opening && <p className="modal-copy">Starting camera</p>}
        {cameraError && cameraState !== "error" && <p className="stage-error">{cameraError}</p>}
        <div className="modal-actions">
          {step > 1 ? (
            <button type="button" className="text-btn" onClick={() => setStep((current) => current - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="text-btn" onClick={onClose}>
              Cancel
            </button>
          )}
          {step < total ? (
            <button
              type="button"
              className={canContinue ? "start modal-go" : "start"}
              disabled={!canContinue}
              onClick={() => setStep((current) => current + 1)}
            >
              Continue
            </button>
          ) : (
            <button type="button" className="start" disabled={source === "file" ? !videoFile || purpose !== "dashboard" : source !== "device" || !cameraId || opening} onClick={finish}>
              {source === "file" ? "Add Video File" : purpose === "dashboard" ? "Add feed" : "Add vision"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
