import { useCallback, useState } from "react";

export type VisionPlace =
  | { view: "list" }
  | { view: "project"; id: string }
  | { view: "analytics"; projectId: string }
  | { view: "training"; projectId: string; feedId: string; model: string }
  | { view: "dashboard"; id: string };

function samePlace(a: VisionPlace, b: VisionPlace) {
  if (a.view !== b.view) return false;
  if (a.view === "list" || b.view === "list") return true;
  if (a.view === "project" && b.view === "project") return a.id === b.id;
  if (a.view === "analytics" && b.view === "analytics") return a.projectId === b.projectId;
  if (a.view === "dashboard" && b.view === "dashboard") return a.id === b.id;
  return (
    a.view === "training" &&
    b.view === "training" &&
    a.projectId === b.projectId &&
    a.feedId === b.feedId &&
    a.model === b.model
  );
}

function projectId(place: VisionPlace) {
  if (place.view === "project") return place.id;
  if (place.view === "analytics") return place.projectId;
  if (place.view === "training") return place.projectId;
  return null;
}

export function useVisionPath(touch: (id: string) => void) {
  const [trail, setTrail] = useState<{ path: VisionPlace[]; index: number }>({
    path: [{ view: "list" }],
    index: 0,
  });
  const place = trail.path[trail.index] ?? { view: "list" as const };

  const visit = useCallback(
    (next: VisionPlace) => {
      setTrail((current) => {
        const here = current.path[current.index];
        if (here && samePlace(here, next)) return current;
        const path = [...current.path.slice(0, current.index + 1), next];
        return { path, index: path.length - 1 };
      });
      const id = projectId(next);
      if (id) touch(id);
    },
    [touch],
  );

  const back = useCallback(() => {
    setTrail((current) => {
      if (current.index === 0) return current;
      const next = current.path[current.index - 1];
      const id = next ? projectId(next) : null;
      if (id) touch(id);
      return { ...current, index: current.index - 1 };
    });
  }, [touch]);

  const forget = useCallback((id: string) => {
    setTrail((current) => {
      const here = current.path[current.index];
      if (here && projectId(here) === id) return { path: [{ view: "list" }], index: 0 };
      const path = current.path.filter((place) => projectId(place) !== id);
      const next = path.length > 0 ? path : [{ view: "list" as const }];
      return { path: next, index: Math.min(current.index, next.length - 1) };
    });
  }, []);

  const forward = useCallback(() => {
    setTrail((current) => {
      if (current.index >= current.path.length - 1) return current;
      const next = current.path[current.index + 1];
      const id = next ? projectId(next) : null;
      if (id) touch(id);
      return { ...current, index: current.index + 1 };
    });
  }, [touch]);

  return {
    place,
    canBack: trail.index > 0,
    canForward: trail.index < trail.path.length - 1,
    visit,
    back,
    forward,
    forget,
  };
}
