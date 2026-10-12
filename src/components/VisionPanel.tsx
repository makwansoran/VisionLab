import { CameraCanvas } from "./CameraFeed";
import { TrainingGround } from "./TrainingGround";
import type { Feed } from "../hooks/useFeeds";
import { saveCapture } from "../labels/db";
import type { Project } from "../hooks/useProjects";
import type { VisionPlace } from "../hooks/useVisionPath";

export function VisionPanel({
  projects,
  place,
  feeds,
  canvasIds,
  onStartFeed,
  confirmDelete,
  onAddVision,
  onAnalytics,
  onTrain,
  model,
  onModel,
}: {
  projects: Project[];
  place: VisionPlace;
  feeds: Feed[];
  canvasIds: string[];
  onStartFeed: (id: string) => Promise<void>;
  confirmDelete: boolean;
  onAddVision: () => void;
  onAnalytics: () => void;
  onTrain: () => void;
  model: string;
  onModel: (projectId: string, name: string) => void;
}) {
  const openId = place.view === "project" ? place.id : place.view === "training" || place.view === "analytics" ? place.projectId : null;
  const open = projects.find((project) => project.id === openId) ?? null;
  const canvasFeeds = feeds.filter((feed) => canvasIds.includes(feed.id));
  const canvasItems = canvasFeeds.map((feed) => ({
    feed,
    name: cameraName(feed, Math.max(0, feeds.findIndex((item) => item.id === feed.id))),
  }));
  const island = open ? (
    <Island active={place.view === "training" ? "training" : place.view === "analytics" ? "analytics" : "canvas"} onCamera={onAddVision} onAnalytics={onAnalytics} onTrain={onTrain} />
  ) : null;

  if (place.view === "training" && open) {
    return (
      <div className="project-stage">
        <TrainingGround projectId={place.projectId} name={open.name} model={model} onModel={(name) => onModel(place.projectId, name)} confirmDelete={confirmDelete} />
      </div>
    );
  }

  if (place.view === "analytics" && open) {
    return (
      <div className="project-stage">
        {island}
        <main className="stage empty-panel" aria-label="Analytics" />
      </div>
    );
  }

  if (open) {
    return (
      <div className="project-stage">
        <CameraCanvas
          feeds={canvasItems}
          start={onStartFeed}
          onTrain={onTrain}
          onCapture={async (cameraId, blob, width, height) => {
            await saveCapture({
              id: crypto.randomUUID(),
              feedId: cameraId,
              createdAt: new Date().toISOString(),
              width,
              height,
              blob,
              looks: [],
              imageClassId: "",
            });
          }}
        />
      </div>
    );
  }

  return <main className="stage empty-panel" aria-label="Vision" />;
}

function Island({
  active,
  onCamera,
  onAnalytics,
  onTrain,
}: {
  active: "canvas" | "analytics" | "training";
  onCamera: () => void;
  onAnalytics: () => void;
  onTrain: () => void;
}) {
  return (
    <div className="vision-float">
      <nav className="island-nav" aria-label="Canvas">
        <button type="button" aria-label="Camera" aria-current={active === "canvas" ? "page" : undefined} onClick={onCamera}>
          <IconCamera />
        </button>
        <button type="button" aria-label="Analytics" aria-current={active === "analytics" ? "page" : undefined} onClick={onAnalytics}>
          <IconAnalytics />
        </button>
        <button type="button" aria-label="Training ground" aria-current={active === "training" ? "page" : undefined} onClick={onTrain}>
          <IconTrain />
        </button>
      </nav>
    </div>
  );
}

function cameraName(feed: Feed, index: number) {
  return feed.name.trim() || feed.stream?.getVideoTracks()[0]?.label.trim() || `Camera ${index + 1}`;
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.2 8.4h10.6c.8 0 1.4.6 1.4 1.4v4.2c0 .8-.6 1.4-1.4 1.4H3.2V8.4Z" />
      <circle cx="16.8" cy="11.9" r="2.35" />
      <path d="M7.6 15.4v2.3" />
      <path d="M5.4 17.7h4.4" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19.5h16" />
      <path d="M7 16.5v-5" />
      <path d="M12 16.5V6.5" />
      <path d="M17 16.5v-3" />
    </svg>
  );
}

function IconTrain() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.5 9.2 11l3.3 3.2L20 6.5" />
      <path d="M14.5 6.5H20v5.5" />
    </svg>
  );
}

