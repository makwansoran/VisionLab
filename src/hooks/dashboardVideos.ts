const DB_NAME = "visionlab-dashboard-videos";
const STORE = "videos";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open dashboard video storage"));
  });
}

export async function saveDashboardVideo(id: string, file: Blob) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(file, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not save video"));
    });
  } finally {
    db.close();
  }
}

export async function loadDashboardVideo(id: string) {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not load video"));
    });
  } finally {
    db.close();
  }
}

export async function removeDashboardVideo(id: string) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not remove video"));
    });
  } finally {
    db.close();
  }
}
