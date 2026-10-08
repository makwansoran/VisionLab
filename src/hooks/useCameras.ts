import { useCallback, useEffect, useState } from "react";

export interface SavedCamera {
  id: string;
  name: string;
  model: string;
  deviceId: string | null;
  createdAt: string;
}

const storageKey = "visionlab.cameras";

function loadCameras(): SavedCamera[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCamera);
  } catch {
    return [];
  }
}

function isCamera(value: unknown): value is SavedCamera {
  if (!value || typeof value !== "object") return false;
  const camera = value as Partial<SavedCamera>;
  return typeof camera.id === "string" && typeof camera.name === "string" && typeof camera.model === "string" && typeof camera.createdAt === "string";
}

export function useCameras() {
  const [cameras, setCameras] = useState<SavedCamera[]>(loadCameras);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cameras));
  }, [cameras]);

  const create = useCallback((input: { name: string; model: string; deviceId?: string | null }) => {
    const camera: SavedCamera = {
      id: crypto.randomUUID(),
      name: input.name.trim() || "Camera",
      model: input.model,
      deviceId: input.deviceId || null,
      createdAt: new Date().toISOString(),
    };
    setCameras((current) => [...current, camera]);
    return camera;
  }, []);

  const remove = useCallback((id: string) => {
    setCameras((current) => current.filter((camera) => camera.id !== id));
  }, []);

  const setModel = useCallback((id: string, model: string) => {
    const next = model.trim();
    if (!next) return;
    setCameras((current) => current.map((camera) => (camera.id === id ? { ...camera, model: next } : camera)));
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const next = name.trim();
    if (!next) return;
    setCameras((current) => current.map((camera) => (camera.id === id ? { ...camera, name: next } : camera)));
  }, []);

  return { cameras, create, remove, rename, setModel };
}
