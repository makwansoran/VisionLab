import { useCallback, useEffect, useState } from "react";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  lastActiveAt: string;
}

const storageKey = "visionlab.projects";

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProject).map((project) => ({
      ...project,
      lastActiveAt: project.lastActiveAt ?? project.createdAt,
    }));
  } catch {
    return [];
  }
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  return typeof project.id === "string" && typeof project.name === "string" && typeof project.createdAt === "string";
}

export function useProjects(write: (text: string) => void) {
  const [projects, setProjects] = useState<Project[]>(loadProjects);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(projects));
  }, [projects]);

  const create = useCallback(
    (name: string) => {
      const now = new Date().toISOString();
      const project: Project = {
        id: crypto.randomUUID(),
        name: name.trim(),
        createdAt: now,
        lastActiveAt: now,
      };
      setProjects((current) => [...current, project]);
      write(`Project saved: ${project.name}`);
      return project;
    },
    [write],
  );

  const touch = useCallback((id: string) => {
    const lastActiveAt = new Date().toISOString();
    setProjects((current) => current.map((project) => (project.id === id ? { ...project, lastActiveAt } : project)));
  }, []);

  const remove = useCallback(
    (id: string) => {
      setProjects((current) => current.filter((project) => project.id !== id));
      if (localStorage.getItem("visionlab-last-project") === id) localStorage.removeItem("visionlab-last-project");
    },
    [],
  );

  return { projects, create, touch, remove };
}
