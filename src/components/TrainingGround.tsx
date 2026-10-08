import { useEffect, useRef, useState } from "react";
import { LabelCanvas, type Selection } from "./LabelCanvas";
import { listCaptures, loadVision, removeCapture, saveCapture, saveVision } from "../labels/db";
import { proposeOutline } from "../labels/propose";
import { CLASS_COLORS, type CaptureRecord, type LabelClass, type Look, type Point, type Tool, type VisionRecord } from "../labels/types";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "segment", label: "Segment" },
  { id: "detect", label: "Detect" },
  { id: "semantic", label: "Semantic" },
  { id: "pose", label: "Pose" },
  { id: "oriented", label: "Oriented" },
  { id: "classify", label: "Classify" },
];

export function TrainingGround({
  projectId,
  name,
  model,
  onModel,
  confirmDelete,
}: {
  projectId: string;
  name: string;
  model: string;
  onModel: (name: string) => void;
  confirmDelete: boolean;
}) {
  const [vision, setVision] = useState<VisionRecord>({ feedId: projectId, scope: "", classes: [], rules: [] });
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("segment");
  const [proposing, setProposing] = useState(false);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [activeClassId, setActiveClassId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState(model);
  const [classDraft, setClassDraft] = useState("");
  const [ruleClassId, setRuleClassId] = useState("");
  const [actionDraft, setActionDraft] = useState("");
  const capturesRef = useRef(captures);
  const selectedRef = useRef(selectedId);
  const past = useRef<CaptureRecord[]>([]);
  const future = useRef<CaptureRecord[]>([]);
  const pixels = useRef<ImageData | null>(null);
  const urls = useRef(new Map<string, string>());
  const [, setUrlTick] = useState(0);
  capturesRef.current = captures;
  selectedRef.current = selectedId;

  useEffect(() => {
    setModelDraft(model);
  }, [model]);

  useEffect(() => {
    let cancel = false;
    setReady(false);
    setSelectedId(null);
    setSelectedLookId(null);
    setSelection(null);
    past.current = [];
    future.current = [];
    Promise.all([loadVision(projectId), listCaptures(projectId)]).then(([nextVision, nextCaptures]) => {
      if (cancel) return;
      setVision(nextVision);
      setCaptures(nextCaptures);
      setActiveClassId(nextVision.classes.find((item) => !item.hidden)?.id ?? nextVision.classes[0]?.id ?? "");
      setRuleClassId(nextVision.classes[0]?.id ?? "");
      setSelectedId(nextCaptures.at(-1)?.id ?? null);
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void saveVision(vision), 250);
    return () => window.clearTimeout(timer);
  }, [vision, ready]);

  useEffect(() => {
    const known = new Set(captures.map((capture) => capture.id));
    for (const [id, url] of urls.current) {
      if (!known.has(id)) {
        URL.revokeObjectURL(url);
        urls.current.delete(id);
      }
    }
    let added = false;
    for (const capture of captures) {
      if (!urls.current.has(capture.id)) {
        urls.current.set(capture.id, URL.createObjectURL(capture.blob));
        added = true;
      }
    }
    if (added) setUrlTick((tick) => tick + 1);
  }, [captures]);

  useEffect(() => {
    return () => {
      for (const url of urls.current.values()) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, [projectId]);

  const selected = captures.find((capture) => capture.id === selectedId) ?? null;
  const selectedBlob = selected?.blob;

  useEffect(() => {
    pixels.current = null;
    if (!selectedBlob) return;
    let cancel = false;
    void createImageBitmap(selectedBlob).then((bitmap) => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || cancel) {
        bitmap.close();
        return;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      pixels.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    });
    return () => {
      cancel = true;
    };
  }, [selectedBlob]);

  const replaceCapture = (next: CaptureRecord, remember: boolean) => {
    if (remember) {
      const current = capturesRef.current.find((capture) => capture.id === next.id);
      if (current) past.current.push(cloneCapture(current));
      if (past.current.length > 40) past.current.shift();
      future.current = [];
    }
    const list = capturesRef.current.map((capture) => (capture.id === next.id ? next : capture));
    capturesRef.current = list;
    setCaptures(list);
    void saveCapture(next);
  };

  useEffect(() => {
    const current = capturesRef.current.find((capture) => capture.id === selectedId);
    if (!current || !current.looks.some(isMark)) return;
    const kept = current.looks.filter((look) => isMark(look) || look.id === selectedLookId);
    if (kept.length === current.looks.length) return;
    replaceCapture({ ...current, looks: kept }, false);
  }, [selectedId, selectedLookId, captures]);

  const onEdit = (nextLooks: Look[] | null, phase: "start" | "move" | "end", selectId?: string) => {
    const id = selectedRef.current;
    const current = capturesRef.current.find((capture) => capture.id === id);
    if (!current) return;
    if (phase === "start" && nextLooks) {
      const prepared = assignClass(nextLooks, vision.classes);
      if (prepared.classes !== vision.classes) {
        setVision({ ...vision, classes: prepared.classes });
        setActiveClassId(prepared.classes[0]?.id ?? "");
      }
      past.current.push(cloneCapture(current));
      if (past.current.length > 40) past.current.shift();
      future.current = [];
      const next = { ...current, looks: prepared.looks };
      const list = capturesRef.current.map((capture) => (capture.id === current.id ? next : capture));
      capturesRef.current = list;
      setCaptures(list);
      if (selectId) setSelectedLookId(selectId);
      return;
    }
    if (phase === "move" && nextLooks) {
      const next = { ...current, looks: nextLooks };
      const list = capturesRef.current.map((capture) => (capture.id === current.id ? next : capture));
      capturesRef.current = list;
      setCaptures(list);
      return;
    }
    if (phase === "end") {
      const latest = capturesRef.current.find((capture) => capture.id === current.id);
      if (latest) void saveCapture(latest);
    }
  };

  const updateLook = (lookId: string, recipe: (look: Look) => Look, remember = true) => {
    if (!selected) return;
    replaceCapture({ ...selected, looks: selected.looks.map((look) => (look.id === lookId ? recipe(look) : look)) }, remember);
  };

  const addClass = (name: string) => {
    const next = name.trim();
    if (!next) return;
    const item: LabelClass = {
      id: crypto.randomUUID(),
      name: next,
      color: CLASS_COLORS[vision.classes.length % CLASS_COLORS.length],
      hidden: false,
    };
    setVision({ ...vision, classes: [...vision.classes, item] });
    setActiveClassId(item.id);
    setClassDraft("");
  };

  const addRule = (classId: string, action: string) => {
    const nextAction = action.trim();
    if (!classId || !nextAction) return;
    const without = vision.rules.filter((rule) => rule.classId !== classId);
    setVision({ ...vision, rules: [...without, { id: crypto.randomUUID(), classId, action: nextAction }] });
    setActionDraft("");
  };

  const removeRule = (id: string) => {
    setVision({ ...vision, rules: vision.rules.filter((rule) => rule.id !== id) });
  };

  const dropCapture = (id: string) => {
    const current = capturesRef.current;
    const index = current.findIndex((capture) => capture.id === id);
    const list = current.filter((capture) => capture.id !== id);
    capturesRef.current = list;
    setCaptures(list);
    past.current = past.current.filter((capture) => capture.id !== id);
    future.current = future.current.filter((capture) => capture.id !== id);
    if (selectedRef.current === id) {
      const neighbor = list[index] ?? list[index - 1] ?? null;
      setSelectedId(neighbor?.id ?? null);
      setSelectedLookId(null);
      setSelection(null);
    }
    void removeCapture(id);
  };

  const undo = () => {
    const previous = past.current.pop();
    if (!previous || !selected) return;
    future.current.push(cloneCapture(selected));
    const list = capturesRef.current.map((capture) => (capture.id === previous.id ? previous : capture));
    capturesRef.current = list;
    setCaptures(list);
    void saveCapture(previous);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next || !selected) return;
    past.current.push(cloneCapture(selected));
    const list = capturesRef.current.map((capture) => (capture.id === next.id ? next : capture));
    capturesRef.current = list;
    setCaptures(list);
    void saveCapture(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (pendingDelete) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      } else if (event.key === "ArrowLeft") {
        step(-1);
      } else if (event.key === "ArrowRight") {
        step(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const step = (dir: number) => {
    if (!selected) return;
    const index = captures.findIndex((capture) => capture.id === selected.id);
    const next = captures[index + dir];
    if (!next) return;
    setSelectedId(next.id);
    setSelectedLookId(null);
    setSelection(null);
    past.current = [];
    future.current = [];
  };

  const removeSelected = () => {
    if (!selected) return;
    if (selection) {
      updateLook(selection.lookId, (look) => removePoint(look, selection));
      setSelection(null);
      return;
    }
    if (selectedLookId) {
      replaceCapture({ ...selected, looks: selected.looks.filter((look) => look.id !== selectedLookId) }, true);
      setSelectedLookId(null);
    }
  };

  const onPropose = (point: Point) => {
    if (!selected || !pixels.current) return;
    const field = tool === "semantic" ? "semantic" : "points";
    const currentLook = selected.looks.find((look) => look.id === selectedLookId) ?? null;
    const existing = currentLook ? (field === "semantic" ? currentLook.semantic ?? [] : currentLook.points) : [];
    const outline = proposeOutline(pixels.current, point, existing);
    const classId = activeClassId || vision.classes[0]?.id || "";
    let classes = vision.classes;
    let used = classId;
    if (!used) {
      used = crypto.randomUUID();
      classes = [{ id: used, name: "Thing", color: CLASS_COLORS[0], hidden: false }];
      setVision({ ...vision, classes });
      setActiveClassId(used);
    }
    if (!currentLook) {
      const look: Look = { id: crypto.randomUUID(), classId: used, reason: "", points: [], ...(field === "semantic" ? { semantic: outline } : { points: outline }) };
      replaceCapture({ ...selected, looks: [...selected.looks, look] }, true);
      setSelectedLookId(look.id);
      return;
    }
    updateLook(currentLook.id, (look) => (field === "semantic" ? { ...look, semantic: outline } : { ...look, points: outline }));
  };

  const index = selected ? captures.findIndex((capture) => capture.id === selected.id) : -1;
  const waiting = captures.filter((capture) => !isLabeled(capture));
  const done = captures.filter(isLabeled);
  const openCapture = (id: string) => {
    setSelectedId(id);
    setSelectedLookId(null);
    setSelection(null);
    past.current = [];
    future.current = [];
  };

  return (
    <div className="training-shell">
      <header className="training-head">
        <h1>Training Ground: {name}</h1>
      </header>
      <div className="training-main">
        <div className="train-center">
          <div className="train-view">
            <div className="train-stage">
              <div className="train-work">
                <div className="train-frame">
                  {selected && urls.current.get(selected.id) ? (
                    <div className="train-canvas">
                      <LabelCanvas
                        url={urls.current.get(selected.id)!}
                        imageWidth={selected.width}
                        imageHeight={selected.height}
                        looks={selected.looks.filter((look) => isMark(look) || look.id === selectedLookId)}
                        classes={vision.classes}
                        classId={activeClassId}
                        tool={tool}
                        proposing={proposing}
                        selectedLookId={selectedLookId}
                        selection={selection}
                        onSelectLook={setSelectedLookId}
                        onSelect={setSelection}
                        onEdit={onEdit}
                        onPropose={onPropose}
                      />
                    </div>
                  ) : (
                    <div className="train-empty" />
                  )}
                </div>
                <ImageMeta capture={selected} classes={vision.classes} visionName={name} />
              </div>
              <div className="train-library">
                <ImageGroup title="To label" captures={waiting} selectedId={selectedId} urlFor={(id) => urls.current.get(id)} onOpen={openCapture} onDelete={(id) => {
                  if (!confirmDelete) {
                    dropCapture(id);
                    return;
                  }
                  setPendingDelete(id);
                }} />
                <ImageGroup title="Labeled" captures={done} selectedId={selectedId} urlFor={(id) => urls.current.get(id)} onOpen={openCapture} onDelete={(id) => {
                  if (!confirmDelete) {
                    dropCapture(id);
                    return;
                  }
                  setPendingDelete(id);
                }} />
              </div>
            </div>
            <aside className="train-side">
              <section className="train-card" aria-label="Label">
                <h2>Label</h2>
                <label className="train-field">
                  <span>Tool</span>
                  <select
                    aria-label="Tool"
                    value={proposing ? "propose" : tool}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "propose") {
                        setProposing(true);
                        return;
                      }
                      setTool(value as Tool);
                      setProposing(false);
                    }}
                  >
                    {TOOLS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                    <option value="propose">Propose</option>
                  </select>
                </label>
                <div className="train-pair">
                  <button type="button" onClick={undo}>
                    Undo
                  </button>
                  <button type="button" onClick={redo}>
                    Redo
                  </button>
                </div>
                <div className="train-step">
                  <button type="button" onClick={() => step(-1)} disabled={index <= 0}>
                    Previous
                  </button>
                  <span>{captures.length === 0 ? "No images" : `${index + 1} / ${captures.length}`}</span>
                  <button type="button" onClick={() => step(1)} disabled={index < 0 || index >= captures.length - 1}>
                    Next
                  </button>
                </div>
                {captures.length === 0 && <p className="train-hint">Capture a frame on the project.</p>}
              </section>
              <section className="train-card" aria-label="Scope">
                <h2>Scope</h2>
                <label className="train-field">
                  <span>Looking for</span>
                  <input
                    aria-label="Looking for"
                    value={vision.scope}
                    placeholder="What this vision watches"
                    onChange={(event) => setVision({ ...vision, scope: event.target.value })}
                  />
                </label>
                <div className="train-rules">
                  <span>When this is seen</span>
                  {vision.classes.length === 0 ? (
                    <p className="train-hint">Add a class first.</p>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        addRule(ruleClassId || vision.classes[0].id, actionDraft);
                      }}
                    >
                      <select aria-label="Class" value={ruleClassId || vision.classes[0].id} onChange={(event) => setRuleClassId(event.target.value)}>
                        {vision.classes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Action"
                        placeholder="What to do"
                        value={actionDraft}
                        onChange={(event) => setActionDraft(event.target.value)}
                      />
                      <button type="submit">Add</button>
                    </form>
                  )}
                  <ul>
                    {vision.rules.map((rule) => (
                      <li key={rule.id}>
                        <span>{vision.classes.find((item) => item.id === rule.classId)?.name ?? "Removed class"}</span>
                        <span>{rule.action}</span>
                        <button type="button" aria-label="Remove" onClick={() => removeRule(rule.id)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
              <section className="train-card" aria-label="Model">
                <h2>Model</h2>
                <label className="train-field">
                  <span>Name</span>
                  <input
                    aria-label="Model"
                    value={modelDraft}
                    onChange={(event) => setModelDraft(event.target.value)}
                    onBlur={() => {
                      const next = modelDraft.trim();
                      if (!next) {
                        setModelDraft(model);
                        return;
                      }
                      onModel(next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>
                <div className="train-classes">
                  <span>Classes</span>
                  <ul>
                    {vision.classes.map((item) => (
                      <li key={item.id}>
                        <button type="button" aria-current={item.id === activeClassId ? "true" : undefined} onClick={() => setActiveClassId(item.id)}>
                          <i style={{ background: item.color }} />
                          {item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      addClass(classDraft);
                    }}
                  >
                    <input
                      aria-label="Add class"
                      placeholder="New class"
                      value={classDraft}
                      onChange={(event) => setClassDraft(event.target.value)}
                    />
                    <button type="submit" aria-label="Add class">
                      +
                    </button>
                  </form>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
      {pendingDelete && (
        <div className="modal-backdrop" onMouseDown={() => setPendingDelete(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-capture-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="delete-capture-title">Are you sure you want to delete?</h2>
            </div>
            <div className="modal-actions">
              <button type="button" className="text-btn" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="start"
                onClick={() => {
                  dropCapture(pendingDelete);
                  setPendingDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function classLabel(classes: LabelClass[], id: string) {
  if (!id) return "None";
  return classes.find((item) => item.id === id)?.name ?? "Removed class";
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pointText(points: Point[]) {
  if (points.length === 0) return "None";
  return points.map((point) => `${Math.round(point.x)}, ${Math.round(point.y)}`).join(" · ");
}

function poseText(points: NonNullable<Look["pose"]>) {
  return points
    .map((point) => {
      const state = point.v === 2 ? "visible" : point.v === 1 ? "occluded" : "not placed";
      return `${point.name} ${Math.round(point.x)}, ${Math.round(point.y)} (${state})`;
    })
    .join(" · ");
}

function ImageMeta({ capture, classes, visionName }: { capture: CaptureRecord | null; classes: LabelClass[]; visionName: string }) {
  return (
    <section className="train-meta" aria-label="Image">
      <h2>Image</h2>
      {!capture ? (
        <p>No image selected.</p>
      ) : (
        <>
          <dl>
            <dt>Vision</dt>
            <dd>{visionName}</dd>
            <dt>Captured</dt>
            <dd>{new Date(capture.createdAt).toLocaleString()}</dd>
            <dt>Width</dt>
            <dd>{capture.width}</dd>
            <dt>Height</dt>
            <dd>{capture.height}</dd>
            <dt>File</dt>
            <dd>
              {capture.blob.type || "Unknown"} · {fileSize(capture.blob.size)}
            </dd>
            <dt>Class</dt>
            <dd>{classLabel(classes, capture.imageClassId)}</dd>
            <dt>Status</dt>
            <dd>{isLabeled(capture) ? "Labeled" : "To label"}</dd>
            <dt>Marks</dt>
            <dd>{marksOf(capture.looks).length}</dd>
            <dt>Id</dt>
            <dd>{capture.id}</dd>
          </dl>
          {marksOf(capture.looks).map((look, index) => (
            <div key={look.id} className="train-mark">
              <h3>Mark {index + 1}</h3>
              <dl>
                <dt>Class</dt>
                <dd>{classLabel(classes, look.classId)}</dd>
                <dt>Reason</dt>
                <dd>{look.reason || "None"}</dd>
                <dt>Segment</dt>
                <dd>{pointText(look.points)}</dd>
                {look.box && (
                  <>
                    <dt>Box</dt>
                    <dd>
                      {Math.round(look.box.x)}, {Math.round(look.box.y)}, {Math.round(look.box.w)} × {Math.round(look.box.h)}
                    </dd>
                  </>
                )}
                {look.semantic && (
                  <>
                    <dt>Semantic</dt>
                    <dd>{pointText(look.semantic)}</dd>
                  </>
                )}
                {look.pose && (
                  <>
                    <dt>Pose</dt>
                    <dd>{poseText(look.pose)}</dd>
                  </>
                )}
                {look.oriented && (
                  <>
                    <dt>Oriented</dt>
                    <dd>{pointText(look.oriented)}</dd>
                  </>
                )}
                <dt>Id</dt>
                <dd>{look.id}</dd>
              </dl>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function isMark(look: Look) {
  if (look.box && (look.box.w > 2 || look.box.h > 2)) return true;
  if ((look.semantic?.length ?? 0) >= 3) return true;
  if ((look.pose?.length ?? 0) > 0) return true;
  if ((look.oriented?.length ?? 0) >= 4) return true;
  return look.points.length >= 3;
}

function marksOf(looks: Look[]) {
  return looks.filter(isMark);
}

function isLabeled(capture: CaptureRecord) {
  return capture.looks.some(isMark) || Boolean(capture.imageClassId);
}

function ImageGroup({
  title,
  captures,
  selectedId,
  urlFor,
  onOpen,
  onDelete,
}: {
  title: string;
  captures: CaptureRecord[];
  selectedId: string | null;
  urlFor: (id: string) => string | undefined;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="train-group" aria-label={title}>
      <h2>
        {title}
        <span>{captures.length}</span>
      </h2>
      {captures.length === 0 ? (
        <p>None</p>
      ) : (
        <div className="capture-strip">
          {captures.map((capture) => (
            <div key={capture.id} className="capture-item">
              <button
                type="button"
                className={capture.id === selectedId ? "capture-thumb is-on" : "capture-thumb"}
                aria-current={capture.id === selectedId ? "true" : undefined}
                aria-label={title}
                onClick={() => onOpen(capture.id)}
              >
                {urlFor(capture.id) && <img src={urlFor(capture.id)} alt="" />}
              </button>
              <button type="button" className="capture-remove" aria-label="Delete" onClick={() => onDelete(capture.id)}>
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
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

function assignClass(looks: Look[], classes: LabelClass[]) {
  if (looks.every((look) => look.classId)) return { looks, classes };
  const nextClasses = classes.length ? classes : [{ id: crypto.randomUUID(), name: "Thing", color: CLASS_COLORS[0], hidden: false }];
  const classId = nextClasses.find((item) => !item.hidden)?.id ?? nextClasses[0].id;
  return { looks: looks.map((look) => (look.classId ? look : { ...look, classId })), classes: nextClasses };
}

function cloneCapture(capture: CaptureRecord): CaptureRecord {
  return { ...capture, looks: structuredClone(capture.looks) };
}

function removePoint(look: Look, selection: Selection): Look {
  if (!selection || selection.lookId !== look.id) return look;
  if (selection.field === "pose") {
    return { ...look, pose: look.pose?.map((point, index) => (index === selection.index ? { ...point, v: 0 as const } : point)) };
  }
  if (selection.field === "semantic") return { ...look, semantic: look.semantic?.filter((_, index) => index !== selection.index) };
  if (selection.field === "oriented") return { ...look, oriented: look.oriented?.filter((_, index) => index !== selection.index) };
  return { ...look, points: look.points.filter((_, index) => index !== selection.index) };
}
