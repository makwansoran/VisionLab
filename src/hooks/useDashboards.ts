import { useCallback, useEffect, useState } from "react";

export interface Dashboard {
  id: string;
  name: string;
  createdAt: string;
  cameraFeeds: DashboardCameraFeed[];
}

export interface DashboardCameraFeed {
  id: string;
  name: string;
  model: string;
  deviceId: string;
  kind?: "camera" | "video";
  fileName?: string;
  fileSize?: number;
  fileLastModified?: number;
}

const storageKey = "visionlab.dashboards";

function loadDashboards(): Dashboard[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDashboard).map((dashboard) => ({
      ...dashboard,
      cameraFeeds: Array.isArray(dashboard.cameraFeeds) ? dashboard.cameraFeeds.filter(isDashboardCameraFeed) : [],
    }));
  } catch {
    return [];
  }
}

function isDashboardCameraFeed(value: unknown): value is DashboardCameraFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Partial<DashboardCameraFeed>;
    return typeof feed.id === "string" && typeof feed.name === "string" && typeof feed.model === "string" && typeof feed.deviceId === "string";
}

function isDashboard(value: unknown): value is Dashboard {
  if (!value || typeof value !== "object") return false;
  const dashboard = value as Partial<Dashboard>;
  return typeof dashboard.id === "string" && typeof dashboard.name === "string" && typeof dashboard.createdAt === "string";
}

export function useDashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>(loadDashboards);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(dashboards));
  }, [dashboards]);

  const create = useCallback((name: string) => {
    const next = name.trim();
    if (!next) return null;
    const dashboard: Dashboard = { id: crypto.randomUUID(), name: next, createdAt: new Date().toISOString(), cameraFeeds: [] };
    setDashboards((current) => [...current, dashboard]);
    return dashboard;
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const next = name.trim();
    if (!next) return;
    setDashboards((current) => current.map((dashboard) => (dashboard.id === id ? { ...dashboard, name: next } : dashboard)));
  }, []);

  const remove = useCallback((id: string) => {
    setDashboards((current) => current.filter((dashboard) => dashboard.id !== id));
  }, []);

  const addFeed = useCallback((id: string, feed: DashboardCameraFeed) => {
    const duplicate = (item: DashboardCameraFeed) => feed.kind === "video"
      ? item.kind === "video" && item.fileName === feed.fileName && item.fileSize === feed.fileSize && item.fileLastModified === feed.fileLastModified
      : item.kind !== "video" && item.deviceId === feed.deviceId;
    setDashboards((current) => current.map((dashboard) => dashboard.id === id && !dashboard.cameraFeeds.some(duplicate)
      ? { ...dashboard, cameraFeeds: [...dashboard.cameraFeeds, feed] }
      : dashboard));
  }, []);

  const removeFeed = useCallback((id: string, feedId: string) => {
    setDashboards((current) => current.map((dashboard) => dashboard.id === id
      ? { ...dashboard, cameraFeeds: dashboard.cameraFeeds.filter((item) => item.id !== feedId) }
      : dashboard));
  }, []);

  return { dashboards, create, rename, remove, addFeed, removeFeed };
}
