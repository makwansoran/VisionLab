import { useEffect, useRef, useState } from "react";
import type { SavedCamera } from "../hooks/useCameras";
import type { Dashboard } from "../hooks/useDashboards";
import type { Feed } from "../hooks/useFeeds";
import { listVisions } from "../labels/db";
import type { VisionRecord } from "../labels/types";

export function HomeOverview({
  name,
  cameras,
  feeds,
  onOpen,
  onTrain,
  onAdd,
  dashboards,
  confirmDelete,
  onCreateDashboard,
  onOpenDashboard,
  onRenameDashboard,
  onRemoveDashboard,
  onRemove,
  onRename,
}: {
  name: string;
  cameras: SavedCamera[];
  feeds: Feed[];
  onOpen: (id: string) => void;
  onTrain: (id: string) => void;
  onAdd: () => void;
  dashboards: Dashboard[];
  confirmDelete: boolean;
  onCreateDashboard: (name: string) => void;
  onOpenDashboard: (id: string) => void;
  onRenameDashboard: (id: string, name: string) => void;
  onRemoveDashboard: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [visions, setVisions] = useState<VisionRecord[]>([]);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingVision, setRenamingVision] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "vision" | "dashboard"; id: string } | null>(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    let live = true;
    listVisions().then((next) => {
      if (!live) return;
      setVisions(next);
    });
    return () => {
      live = false;
    };
  }, [cameras]);

  return (
    <main className="home" aria-label="Home">
      <header className="home-head">
        <h1>Hello, {name}</h1>
      </header>
      <div className="home-boards">
        <section className="home-box" aria-label="Vision">
          <div className="home-box-head">
            <h2>
              <IconVision />
              Vision
            </h2>
            <button type="button" className="home-add" aria-label="Add camera" onClick={onAdd}>
              <IconPlus />
            </button>
          </div>
          {cameras.length === 0 ? (
            <p className="home-empty">You have no visions.</p>
          ) : (
            <ul>
              {cameras.map((camera) => {
                const liveFeed = feeds.find((item) => item.cameraId === camera.id);
                const vision = visions.find((item) => item.feedId === camera.id);
                return (
                  <li key={camera.id}>
                    <span className="home-vision-icon">
                      <IconVision />
                    </span>
                    {renamingVision === camera.id ? (
                      <form
                        className="home-draft"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const input = event.currentTarget.elements.namedItem("name");
                          const next = input instanceof HTMLInputElement ? input.value : camera.name;
                          setRenamingVision(null);
                          if (next.trim()) onRename(camera.id, next);
                        }}
                      >
                        <input
                          name="name"
                          aria-label="Vision name"
                          defaultValue={camera.name}
                          autoFocus
                          onBlur={(event) => {
                            if (skipBlur.current) {
                              skipBlur.current = false;
                              return;
                            }
                            const next = event.currentTarget.value;
                            setRenamingVision(null);
                            if (next.trim()) onRename(camera.id, next);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              skipBlur.current = true;
                              setRenamingVision(null);
                            }
                          }}
                        />
                      </form>
                    ) : (
                    <>
                    <button type="button" className="home-project" onClick={() => onOpen(camera.id)}>
                      <span>
                        {camera.name}
                        <small>
                          {camera.model}
                          {" · "}
                          {feedWord(liveFeed)}
                        </small>
                      </span>
                    </button>
                    <button type="button" className="home-train" aria-label="Actions" aria-expanded={actionsFor === camera.id} onClick={() => setActionsFor(actionsFor === camera.id ? null : camera.id)}>
                      <IconActions />
                    </button>
                    {actionsFor === camera.id && (
                      <ul className="home-actions">
                        {vision && vision.rules.length > 0 ? (
                          vision.rules.map((rule) => (
                            <li key={rule.id}>
                              {vision.classes.find((item) => item.id === rule.classId)?.name ?? "Removed class"} → {rule.action}
                            </li>
                          ))
                        ) : (
                          <li>No actions</li>
                        )}
                      </ul>
                    )}
                    <button type="button" className="home-train" aria-label="Train" onClick={() => onTrain(camera.id)}>
                      <IconTrain />
                    </button>
                    <button
                      type="button"
                      className="home-train"
                      aria-label="Settings"
                      onClick={() => setRenamingVision(camera.id)}
                    >
                      <IconSettings />
                    </button>
                    <button
                      type="button"
                      className="home-train"
                      aria-label="Delete"
                      onClick={() => {
                        if (!confirmDelete) {
                          onRemove(camera.id);
                          return;
                        }
                        setPendingDelete({ kind: "vision", id: camera.id });
                      }}
                    >
                      <TrashIcon />
                    </button>
                    </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="home-box" aria-label="Dashboards">
          <div className="home-box-head">
            <h2>Dashboards</h2>
            <button type="button" className="home-add" aria-label="Add dashboard" onClick={() => setDraft("")}>
              <IconPlus />
            </button>
          </div>
          {draft !== null && (
            <form
              className="home-draft"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) onCreateDashboard(draft);
                setDraft(null);
              }}
            >
              <input
                aria-label="Dashboard name"
                value={draft}
                autoFocus
                placeholder="Name"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDraft(null);
                  }
                }}
              />
            </form>
          )}
          {dashboards.length === 0 ? (
            <p className="home-empty">You have no dashboards.</p>
          ) : (
            <ul>
              {dashboards.map((dashboard) => (
                <li key={dashboard.id}>
                  {renaming === dashboard.id ? (
                    <form
                      className="home-draft"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const input = event.currentTarget.elements.namedItem("name");
                        const next = input instanceof HTMLInputElement ? input.value : dashboard.name;
                        setRenaming(null);
                        if (next.trim()) onRenameDashboard(dashboard.id, next);
                      }}
                    >
                      <input
                        name="name"
                        aria-label="Dashboard name"
                        defaultValue={dashboard.name}
                        autoFocus
                        onBlur={(event) => {
                          if (skipBlur.current) {
                            skipBlur.current = false;
                            return;
                          }
                          const next = event.currentTarget.value;
                          setRenaming(null);
                          if (next.trim()) onRenameDashboard(dashboard.id, next);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            skipBlur.current = true;
                            setRenaming(null);
                          }
                        }}
                      />
                    </form>
                  ) : (
                    <button type="button" className="home-project" onClick={() => onOpenDashboard(dashboard.id)} onContextMenu={(event) => {
                      event.preventDefault();
                      setRenaming(dashboard.id);
                    }}>
                      <span>{dashboard.name}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="home-train home-delete"
                    aria-label="Delete"
                    onClick={() => {
                      if (!confirmDelete) {
                        onRemoveDashboard(dashboard.id);
                        return;
                      }
                      setPendingDelete({ kind: "dashboard", id: dashboard.id });
                    }}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {pendingDelete && (
        <div className="modal-backdrop" onMouseDown={() => setPendingDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-dashboard-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="delete-dashboard-title">Are you sure you want to delete?</h2>
            </div>
            <div className="modal-actions">
              <button type="button" className="text-btn" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="start"
                onClick={() => {
                  if (pendingDelete.kind === "vision") onRemove(pendingDelete.id);
                  else onRemoveDashboard(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconActions() {
  return (
    <svg className="home-fill" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2.2 4.2 13.4h6.1l-.8 8.4 9.3-12.2h-6.2l.9-7.4Z" />
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

function IconVision() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M7 7l.8 12.2A1.5 1.5 0 0 0 9.3 20.6h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function feedWord(feed: Feed | null | undefined) {
  if (!feed || feed.status === "idle") return "Off";
  if (feed.status === "live") return "Live";
  if (feed.status === "starting") return "Starting";
  return "Not started";
}

