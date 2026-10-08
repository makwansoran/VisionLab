import { useCallback, useEffect, useState } from "react";

export interface Dashboard {
  id: string;
  name: string;
  createdAt: string;
}

const storageKey = "visionlab.dashboards";

function loadDashboards(): Dashboard[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDashboard);
  } catch {
    return [];
  }
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
    const dashboard: Dashboard = { id: crypto.randomUUID(), name: next, createdAt: new Date().toISOString() };
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

  return { dashboards, create, rename, remove };
}
