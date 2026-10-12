import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AddCameraModal } from "./components/AddCameraModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { LoginPage } from "./components/LoginPage";
import { isAuthConfigured, subscribeToAuthChanges } from "./auth/authService";
import { Sidebar, type SectionId } from "./components/Sidebar";
import { HomeOverview } from "./components/HomeOverview";
import { VisionPanel } from "./components/VisionPanel";
import { AnalysePanel } from "./components/AnalysePanel";
import { useAccount } from "./hooks/useAccount";
import { useCameras } from "./hooks/useCameras";
import { useDashboards } from "./hooks/useDashboards";
import { useFeeds } from "./hooks/useFeeds";
import { useProjects } from "./hooks/useProjects";
import { useVisionPath, type VisionPlace } from "./hooks/useVisionPath";
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
  const { feeds, start, add, rename: renameFeed, remove } = useFeeds(write, {
    autoStart: settings.autoStart,
    resolution: settings.resolution,
  });
  const { cameras, create: createCamera, remove: removeCamera, rename: renameCamera, setModel: setCameraModel } = useCameras();
  const { dashboards, create: createDashboard, rename: renameDashboard, remove: removeDashboard } = useDashboards();
  const { touch } = useProjects(write);
  const vision = useVisionPath(touch);
  const { plan } = useAccount();
  const [onCanvas, setOnCanvas] = useState<string[]>([]);
  useEffect(() => {
    const match = feeds.find((feed) => feed.cameraId === connectedId);
    setOnCanvas(match ? [match.id] : []);
  }, [feeds, connectedId]);

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
          <main className="stage empty-panel dashboard-page" aria-label="Dashboard">
            <h1>{dashboards.find((item) => vision.place.view === "dashboard" && item.id === vision.place.id)?.name ?? "Dashboard"}</h1>
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
    </div>
  );
}
