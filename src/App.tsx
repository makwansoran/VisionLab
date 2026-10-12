import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { AddCameraModal } from "./components/AddCameraModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { LoginPage } from "./components/LoginPage";
import { isAuthConfigured, subscribeToAuthChanges } from "./auth/authService";
import { Sidebar, type SectionId } from "./components/Sidebar";
import { HomeOverview } from "./components/HomeOverview";
import { VisionPanel } from "./components/VisionPanel";
import { FeedTile } from "./components/CameraFeed";
import { AnalysePanel } from "./components/AnalysePanel";
import { useAccount } from "./hooks/useAccount";
import { useCameras } from "./hooks/useCameras";
import { useDashboards } from "./hooks/useDashboards";
import { useFeeds } from "./hooks/useFeeds";
import { useProjects } from "./hooks/useProjects";
import { useVisionPath, type VisionPlace } from "./hooks/useVisionPath";
import { loadDashboardVideo, removeDashboardVideo, saveDashboardVideo } from "./hooks/dashboardVideos";
import { loadLastProject, loadSettings, saveLastProject, saveSettings, type AppSettings } from "./settings";

function viewKey(section: SectionId, place: VisionPlace) {
  if (section !== "vision") return section;
  if (place.view === "project") return `project:${place.id}`;
  if (place.view === "training") return `training:${place.projectId}`;
  if (place.view === "analytics") return `analytics:${place.projectId}`;
  if (place.view === "dashboard") return `dashboard:${place.id}`;
  return "list";
}

export function App() {
  const [section, setSection] = useState<SectionId>("vision");
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [addingCamera, setAddingCamera] = useState(false);
  const [addingDashboardCamera, setAddingDashboardCamera] = useState(false);
  const [connectedId, setConnectedId] = useState<string | null>(() => localStorage.getItem("visionlab-connected-camera"));
  const restored = useRef(false);
  const write = useCallback((text: string) => {
    void text;
  }, []);
  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);
  useEffect(() => {
    if (!isAuthConfigured) return;
    const subscription = subscribeToAuthChanges(setAuthSession);
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.mirror = settings.mirrorPreview ? "on" : "off";
    saveSettings(settings);
  }, [settings]);
  const { feeds, start, add, addVideo, rename: renameFeed, remove } = useFeeds(write, {
    autoStart: settings.autoStart,
    resolution: settings.resolution,
  });
  const { cameras, create: createCamera, remove: removeCamera, rename: renameCamera, setModel: setCameraModel } = useCameras();
  const { dashboards, create: createDashboard, rename: renameDashboard, remove: removeDashboard, addFeed: addDashboardFeed, removeFeed: removeDashboardFeed } = useDashboards();
  const { touch } = useProjects(write);
  const vision = useVisionPath(touch);
  const { plan } = useAccount();
  const [onCanvas, setOnCanvas] = useState<string[]>([]);
  useEffect(() => {
    const match = feeds.find((feed) => feed.cameraId === connectedId);
    setOnCanvas(match ? [match.id] : []);
  }, [feeds, connectedId]);

  const dashboardId = vision.place.view === "dashboard" ? vision.place.id : null;
  const activeDashboard = dashboardId ? dashboards.find((item) => item.id === dashboardId) : undefined;
  const restoringVideoIds = useRef(new Set<string>());
  useEffect(() => {
    if (!activeDashboard) return;
    activeDashboard.cameraFeeds.forEach((cameraFeed) => {
      if (feeds.some((feed) => feed.cameraId === cameraFeed.id)) return;
      if (cameraFeed.kind === "video") {
        if (restoringVideoIds.current.has(cameraFeed.id)) return;
        restoringVideoIds.current.add(cameraFeed.id);
        void loadDashboardVideo(cameraFeed.id).then((blob) => {
          if (blob && !feeds.some((feed) => feed.cameraId === cameraFeed.id)) {
            addVideo(cameraFeed.name, URL.createObjectURL(blob), cameraFeed.id);
          }
        }).catch(() => undefined).finally(() => restoringVideoIds.current.delete(cameraFeed.id));
        return;
      }
      add(cameraFeed.model, cameraFeed.deviceId, cameraFeed.name, undefined, cameraFeed.id);
    });
  }, [activeDashboard, feeds, add, addVideo]);

  useEffect(() => {
    const id =
      vision.place.view === "project"
        ? vision.place.id
        : vision.place.view === "training" || vision.place.view === "analytics"
          ? vision.place.projectId
          : null;
    if (id) saveLastProject(id);
  }, [vision.place]);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (!settings.reopenProject) return;
    const id = loadLastProject();
    const camera = cameras.find((item) => item.id === id);
    if (!camera) return;
    setConnectedId(camera.id);
    localStorage.setItem("visionlab-connected-camera", camera.id);
    add(camera.model, camera.deviceId ?? undefined, camera.name, undefined, camera.id);
    vision.visit({ view: "project", id: camera.id });
  }, [cameras, settings.reopenProject, vision, add]);

  return (
    <div className="app">
      <Sidebar
        active={section}
        name={authSession?.user.email || settings.displayName.trim() || "User"}
        image={settings.profileImage}
        onProfileClick={() => setSection("login")}
        plan={plan?.name ?? null}
        onChange={(id) => {
          if (id === "vision") vision.visit({ view: "list" });
          setSection(id);
        }}
      />
      <div className="workspace">
        <div key={viewKey(section, vision.place)} className="view-stage">
        {section === "vision" && vision.place.view === "list" ? (
          <HomeOverview
            name={settings.displayName.trim() || "User"}
            cameras={cameras}
            feeds={feeds}
            onAdd={() => setAddingCamera(true)}
            onOpen={(id) => {
              const camera = cameras.find((item) => item.id === id);
              if (!camera) return;
              setConnectedId(camera.id);
              localStorage.setItem("visionlab-connected-camera", camera.id);
              feeds.filter((feed) => feed.cameraId !== camera.id).forEach((feed) => remove(feed.id));
              if (!feeds.some((feed) => feed.cameraId === camera.id)) {
                add(camera.model, camera.deviceId ?? undefined, camera.name, undefined, camera.id);
              }
              vision.visit({ view: "project", id: camera.id });
            }}
            onTrain={(id) => {
              const camera = cameras.find((item) => item.id === id);
              if (!camera) return;
              setConnectedId(camera.id);
              localStorage.setItem("visionlab-connected-camera", camera.id);
              feeds.filter((feed) => feed.cameraId !== camera.id).forEach((feed) => remove(feed.id));
              const existing = feeds.find((feed) => feed.cameraId === camera.id);
              const feedId = existing?.id ?? add(camera.model, camera.deviceId ?? undefined, camera.name, undefined, camera.id);
              vision.visit({
                view: "training",
                projectId: camera.id,
                feedId,
                model: existing?.model ?? camera.model,
              });
            }}
            onRename={(id, next) => {
              renameCamera(id, next);
              renameFeed(id, next);
            }}
            onRemove={(id) => {
              removeCamera(id);
              feeds.filter((feed) => feed.cameraId === id).forEach((feed) => remove(feed.id));
              if (connectedId === id) {
                setConnectedId(null);
                localStorage.removeItem("visionlab-connected-camera");
              }
              vision.forget(id);
            }}
            dashboards={dashboards}
            confirmDelete={settings.confirmDelete}
            onCreateDashboard={(dashboardName) => {
              createDashboard(dashboardName);
            }}
            onOpenDashboard={(id) => vision.visit({ view: "dashboard", id })}
            onRenameDashboard={renameDashboard}
            onRemoveDashboard={(id) => {
              removeDashboard(id);
              if (vision.place.view === "dashboard" && vision.place.id === id) vision.visit({ view: "list" });
            }}
          />
        ) : section === "vision" && vision.place.view === "dashboard" ? (
          <main className="stage dashboard-page" aria-label="Dashboard">
            <header className="dashboard-head">
              <h1>{activeDashboard?.name ?? "Dashboard"}</h1>
              <button type="button" className="dashboard-add" aria-label="Add camera feed" title="Add camera feed" onClick={() => setAddingDashboardCamera(true)}>
                <PlusIcon />
              </button>
            </header>
            <div className="dashboard-feeds">
              {(() => {
                const dashboardFeeds = (activeDashboard?.cameraFeeds ?? []).flatMap((cameraFeed) => {
                  const feed = feeds.find((item) => item.cameraId === cameraFeed.id);
                  return feed ? [feed] : [];
                });
                const columns = dashboardFeeds.length > 1 ? Math.ceil(Math.sqrt(dashboardFeeds.length)) : 1;
                const countClass = dashboardFeeds.length === 1 ? "single" : "multiple";
                return <div className={`dashboard-feed-grid ${countClass}`} style={{ "--dashboard-columns": columns } as CSSProperties}>
                  {dashboardFeeds.map((feed) => <FeedTile
                    key={feed.id}
                    feed={feed}
                    onRetry={() => void start(feed.id)}
                    onRemove={() => {
                      if (feed?.cameraId && activeDashboard) {
                        const cameraFeed = activeDashboard.cameraFeeds.find((item) => item.id === feed.cameraId);
                        if (cameraFeed?.kind === "video") void removeDashboardVideo(cameraFeed.id);
                        removeDashboardFeed(activeDashboard.id, feed.cameraId);
                        remove(feed.id);
                      }
                    }}
                  />)}
                </div>;
              })()}
            </div>
          </main>
        ) : section === "vision" ? (
          <VisionPanel
            projects={cameras.map((camera) => ({ id: camera.id, name: camera.name, createdAt: camera.createdAt, lastActiveAt: camera.createdAt }))}
            place={vision.place}
            feeds={feeds}
            canvasIds={onCanvas}
            onStartFeed={start}
            confirmDelete={settings.confirmDelete}
            onAddVision={() => setAddingCamera(true)}
            onAnalytics={() => {
              const projectId =
                vision.place.view === "project"
                  ? vision.place.id
                  : vision.place.view === "training" || vision.place.view === "analytics"
                    ? vision.place.projectId
                    : null;
              if (!projectId) return;
              vision.visit({ view: "analytics", projectId });
            }}
            model={
              cameras.find((camera) => camera.id === (vision.place.view === "training" ? vision.place.projectId : ""))?.model ?? "Argus 1.0"
            }
            onModel={(projectId, name) => setCameraModel(projectId, name)}
            onTrain={() => {
              const projectId =
                vision.place.view === "project"
                  ? vision.place.id
                  : vision.place.view === "training" || vision.place.view === "analytics"
                    ? vision.place.projectId
                    : null;
              if (!projectId) return;
              const feed = feeds.find((item) => onCanvas.includes(item.id)) ?? feeds[0];
              vision.visit({
                view: "training",
                projectId,
                feedId: feed?.id ?? "",
                model: feed?.model ?? "Argus 1.0",
              });
            }}
          />
        ) : section === "login" ? (
          <LoginPage session={authSession} onSignedIn={() => setSection("vision")} />
        ) : section === "analyse" ? (
          <AnalysePanel />
        ) : section === "notifications" ? (
          <main className="home" aria-label="Notifications">
            <header className="home-head">
              <h1>Notifications</h1>
            </header>
            <p className="home-empty">You have no notifications.</p>
          </main>
        ) : (
          <SettingsPanel settings={settings} onChange={updateSettings} />
        )}
        </div>
      </div>
      {addingCamera && (
        <AddCameraModal
          onClose={() => setAddingCamera(false)}
          onAddDevice={(model, deviceId, name, stream) => {
            const camera = createCamera({ name, model, deviceId });
            if (connectedId) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            setConnectedId(camera.id);
            localStorage.setItem("visionlab-connected-camera", camera.id);
            add(model, deviceId, camera.name, stream, camera.id);
            setSection("vision");
            vision.visit({ view: "project", id: camera.id });
          }}
          resolution={settings.resolution}
        />
      )}
      {addingDashboardCamera && activeDashboard && (
        <AddCameraModal
          purpose="dashboard"
          excludedDeviceIds={activeDashboard.cameraFeeds.filter((cameraFeed) => cameraFeed.kind !== "video").map((cameraFeed) => cameraFeed.deviceId)}
          excludedVideoFiles={activeDashboard.cameraFeeds.filter((cameraFeed) => cameraFeed.kind === "video").map((cameraFeed) => ({
            name: cameraFeed.fileName ?? cameraFeed.name,
            size: cameraFeed.fileSize ?? -1,
            lastModified: cameraFeed.fileLastModified ?? -1,
          }))}
          onClose={() => setAddingDashboardCamera(false)}
          resolution={settings.resolution}
          onAddDevice={(model, deviceId, name, stream) => {
            const cameraFeed = { id: crypto.randomUUID(), name, model, deviceId, kind: "camera" as const };
            addDashboardFeed(activeDashboard.id, cameraFeed);
            add(model, deviceId, name, stream, cameraFeed.id);
          }}
          onAddVideo={(file) => {
            const cameraFeed = {
              id: crypto.randomUUID(),
              name: file.name,
              model: "Video file",
              deviceId: "",
              kind: "video" as const,
              fileName: file.name,
              fileSize: file.size,
              fileLastModified: file.lastModified,
            };
            void saveDashboardVideo(cameraFeed.id, file).then(() => {
              addDashboardFeed(activeDashboard.id, cameraFeed);
              addVideo(file.name, URL.createObjectURL(file), cameraFeed.id);
            }).catch(() => window.alert("Could not save this video for the dashboard."));
          }}
        />
      )}
    </div>
  );
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
