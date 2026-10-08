import { normalizeBox, normalizePoints } from "./geometry";
import type { CaptureRecord, Look, VisionRecord } from "./types";

const DB_NAME = "visionlab-labels";
const DB_VERSION = 1;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("visions")) db.createObjectStore("visions", { keyPath: "feedId" });
      if (!db.objectStoreNames.contains("captures")) {
        const store = db.createObjectStore("captures", { keyPath: "id" });
        store.createIndex("feedId", "feedId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (stores: { visions: IDBObjectStore; captures: IDBObjectStore }) => IDBRequest<T>) {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(["visions", "captures"], mode);
        const request = run({ visions: tx.objectStore("visions"), captures: tx.objectStore("captures") });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function readyVision(feedId: string, record?: Partial<VisionRecord> | null): VisionRecord {
  return {
    feedId,
    scope: record?.scope ?? "",
    classes: record?.classes ?? [],
    rules: record?.rules ?? [],
  };
}

export function loadVision(feedId: string) {
  return withStore<VisionRecord | undefined>("readonly", ({ visions }) => visions.get(feedId)).then((record) => readyVision(feedId, record));
}

export function saveVision(record: VisionRecord) {
  return withStore("readwrite", ({ visions }) => visions.put(record)).then(() => undefined);
}

export function listVisions() {
  return withStore<VisionRecord[]>("readonly", ({ visions }) => visions.getAll());
}

export type CaptureSummary = { feedId: string; frames: number; labeled: number };

export function summarizeCaptures() {
  return openDb().then(
    (db) =>
      new Promise<CaptureSummary[]>((resolve, reject) => {
        const counts = new Map<string, CaptureSummary>();
        const tx = db.transaction("captures", "readonly");
        const request = tx.objectStore("captures").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const row = cursor.value as CaptureRecord;
          const current = counts.get(row.feedId) ?? { feedId: row.feedId, frames: 0, labeled: 0 };
          current.frames += 1;
          if (row.looks.length > 0 || row.imageClassId) current.labeled += 1;
          counts.set(row.feedId, current);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve([...counts.values()]);
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export type VisionStats = { frames: number; labeled: number; marks: Record<string, number> };

export function visionStats(feedId: string) {
  return openDb().then(
    (db) =>
      new Promise<VisionStats>((resolve, reject) => {
        const stats: VisionStats = { frames: 0, labeled: 0, marks: {} };
        const tx = db.transaction("captures", "readonly");
        const request = tx.objectStore("captures").index("feedId").openCursor(IDBKeyRange.only(feedId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const row = cursor.value as CaptureRecord;
          stats.frames += 1;
          if (row.looks.length > 0 || row.imageClassId) stats.labeled += 1;
          if (row.imageClassId) stats.marks[row.imageClassId] = (stats.marks[row.imageClassId] ?? 0) + 1;
          for (const look of row.looks) {
            if (!look.classId) continue;
            stats.marks[look.classId] = (stats.marks[look.classId] ?? 0) + 1;
          }
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve(stats);
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export function listCaptures(feedId: string) {
  return withStore<CaptureRecord[]>("readonly", ({ captures }) => captures.index("feedId").getAll(feedId)).then((rows) =>
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export function saveCapture(record: CaptureRecord) {
  const next = { ...record, looks: record.looks.map((look) => withNorm(look, record.width, record.height)) };
  return withStore("readwrite", ({ captures }) => captures.put(next)).then(() => undefined);
}

export function removeCapture(id: string) {
  return withStore("readwrite", ({ captures }) => captures.delete(id)).then(() => undefined);
}

function withNorm(look: Look, width: number, height: number): Look & { norm: Record<string, number[]> } {
  const norm: Record<string, number[]> = {};
  if (look.points.length) norm.segment = normalizePoints(look.points, width, height);
  if (look.box) norm.box = normalizeBox(look.box, width, height);
  if (look.semantic?.length) norm.semantic = normalizePoints(look.semantic, width, height);
  if (look.oriented?.length) norm.oriented = normalizePoints(look.oriented, width, height);
  if (look.pose?.length) {
    norm.pose = look.pose.flatMap((point) => [point.x / width, point.y / height, point.v]);
  }
  return { ...look, norm };
}
