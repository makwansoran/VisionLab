import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { boxFromDrag, centroid, cornersOf, dist, moveBox, nearestEdge, nearestPoint, pointInPolygon, polygonPath, resizeBox, rotatePoints } from "../labels/geometry";
import { PERSON_POSE, type Box, type Keypoint, type LabelClass, type Look, type Point, type Tool } from "../labels/types";

type Field = "points" | "semantic" | "oriented" | "pose";

export type Selection = { lookId: string; field: Field; index: number } | null;

type View = { zoom: number; panX: number; panY: number; width: number; height: number; imageW: number; imageH: number };

export function LabelCanvas({
  url,
  imageWidth,
  imageHeight,
  looks,
  classes,
  classId,
  tool,
  proposing,
  selectedLookId,
  selection,
  onSelectLook,
  onSelect,
  onEdit,
  onPropose,
}: {
  url: string;
  imageWidth: number;
  imageHeight: number;
  looks: Look[];
  classes: LabelClass[];
  classId: string;
  tool: Tool;
  proposing: boolean;
  selectedLookId: string | null;
  selection: Selection;
  onSelectLook: (id: string | null) => void;
  onSelect: (selection: Selection) => void;
  onEdit: (looks: Look[] | null, phase: "start" | "move" | "end", selectId?: string) => void;
  onPropose: (point: Point) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ zoom: 1, panX: 0, panY: 0, width: 1, height: 1, imageW: imageWidth, imageH: imageHeight });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 1, h: 1 });
  const space = useRef(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const watch = new ResizeObserver(() => setSize({ w: stage.clientWidth, h: stage.clientHeight }));
    watch.observe(stage);
    setSize({ w: stage.clientWidth, h: stage.clientHeight });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space") space.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const fit = Math.min(size.w / imageWidth, size.h / imageHeight) || 1;
  const scale = fit * zoom;
  const ox = (size.w - imageWidth * scale) / 2 + pan.x;
  const oy = (size.h - imageHeight * scale) / 2 + pan.y;
  viewRef.current = { zoom, panX: pan.x, panY: pan.y, width: size.w, height: size.h, imageW: imageWidth, imageH: imageHeight };

  const toImage = (clientX: number, clientY: number): Point => {
    const stage = stageRef.current;
    const view = viewRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    const fitNow = Math.min(view.width / view.imageW, view.height / view.imageH) || 1;
    const scaleNow = fitNow * view.zoom;
    const left = (view.width - view.imageW * scaleNow) / 2 + view.panX;
    const top = (view.height - view.imageH * scaleNow) / 2 + view.panY;
    return { x: (clientX - rect.left - left) / scaleNow, y: (clientY - rect.top - top) / scaleNow };
  };

  const hit = 10 / scale;
  const colorOf = (classId: string) => classes.find((item) => item.id === classId)?.color ?? "#eceae4";
  const hidden = new Set(classes.filter((item) => item.hidden).map((item) => item.id));
  const visible = looks.filter((look) => !hidden.has(look.classId));

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => Math.min(8, Math.max(0.4, current * (event.deltaY > 0 ? 0.92 : 1.08))));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1 || space.current) {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const origin = { ...pan };
      const move = (moveEvent: PointerEvent) => setPan({ x: origin.x + moveEvent.clientX - startX, y: origin.y + moveEvent.clientY - startY });
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    if (event.button !== 0 || tool === "classify") return;
    const point = clamp(toImage(event.clientX, event.clientY), imageWidth, imageHeight);
    if (proposing && (tool === "segment" || tool === "semantic")) {
      const field = tool === "semantic" ? "semantic" : "points";
      const vertex = findVertex(visible, selectedLookId, field, point, hit);
      if (!vertex) {
        onPropose(point);
        return;
      }
    }
    if (tool === "detect") {
      drawBox(event, point);
      return;
    }
    if (tool === "oriented") {
      drawOriented(event, point);
      return;
    }
    if (tool === "pose") {
      drawPose(event, point);
      return;
    }
    drawVector(event, point, tool === "semantic" ? "semantic" : "points");
  };

  const drawVector = (event: ReactPointerEvent<HTMLDivElement>, point: Point, field: "points" | "semantic") => {
    const selected = visible.find((look) => look.id === selectedLookId) ?? null;
    const vertex = findVertex(visible, selectedLookId, field, point, hit);
    if (vertex) {
      onSelectLook(vertex.look.id);
      onSelect({ lookId: vertex.look.id, field, index: vertex.index });
      dragPoint(event, vertex.look.id, field, vertex.index);
      return;
    }
    if (selected) {
      const polygon = fieldPoints(selected, field);
      const edge = nearestEdge(point, polygon, hit);
      if (edge >= 0) {
        const nextPoints = [...polygon];
        nextPoints.splice(edge + 1, 0, point);
        const next = looks.map((look) => (look.id === selected.id ? setField(look, field, nextPoints) : look));
        onSelect({ lookId: selected.id, field, index: edge + 1 });
        dragPoint(event, selected.id, field, edge + 1, next);
        return;
      }
      if (polygon.length >= 3 && pointInPolygon(point, polygon)) {
        onSelectLook(selected.id);
        onSelect(null);
        return;
      }
    }
    const inside = visible.find((look) => {
      const polygon = fieldPoints(look, field);
      return polygon.length >= 3 && pointInPolygon(point, polygon);
    });
    if (inside) {
      onSelectLook(inside.id);
      onSelect(null);
      return;
    }
    const target = selected ?? createLook(classId);
    const polygon = fieldPoints(target, field);
    const nextPoints = [...polygon, point];
    const next = selected ? looks.map((look) => (look.id === target.id ? setField(look, field, nextPoints) : look)) : [...looks, setField(target, field, nextPoints)];
    onSelectLook(target.id);
    onSelect({ lookId: target.id, field, index: nextPoints.length - 1 });
    dragPoint(event, target.id, field, nextPoints.length - 1, next);
  };

  const drawBox = (event: ReactPointerEvent<HTMLDivElement>, point: Point) => {
    const selected = visible.find((look) => look.id === selectedLookId && look.box) ?? null;
    if (selected?.box) {
      const handle = boxHandle(selected.box, point, hit);
      if (handle) {
        onSelectLook(selected.id);
        onSelect(null);
        dragBox(event, selected.id, handle);
        return;
      }
      if (insideBox(selected.box, point)) {
        onSelectLook(selected.id);
        dragBox(event, selected.id, "move");
        return;
      }
    }
    const other = visible.find((look) => look.box && insideBox(look.box, point));
    if (other) {
      onSelectLook(other.id);
      onSelect(null);
      return;
    }
    const target = selectedLookId ? looks.find((look) => look.id === selectedLookId) ?? createLook(classId) : createLook(classId);
    const exists = looks.some((look) => look.id === target.id);
    const seeded = { ...target, box: { x: point.x, y: point.y, w: 1, h: 1 } };
    const next = exists ? looks.map((look) => (look.id === seeded.id ? seeded : look)) : [...looks, seeded];
    onSelectLook(seeded.id);
    onEdit(next, "start", seeded.id);
    const move = (moveEvent: PointerEvent) => {
      const end = clamp(toImage(moveEvent.clientX, moveEvent.clientY), imageWidth, imageHeight);
      onEdit(next.map((look) => (look.id === seeded.id ? { ...look, box: boxFromDrag(point, end) } : look)), "move", seeded.id);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEdit(null, "end", seeded.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const drawOriented = (event: ReactPointerEvent<HTMLDivElement>, point: Point) => {
    const selected = visible.find((look) => look.id === selectedLookId && (look.oriented?.length ?? 0) >= 4) ?? null;
    if (selected?.oriented) {
      const index = nearestPoint(point, selected.oriented, hit);
      if (index >= 0) {
        onSelectLook(selected.id);
        onSelect({ lookId: selected.id, field: "oriented", index });
        dragPoint(event, selected.id, "oriented", index);
        return;
      }
      const handle = rotateHandle(selected.oriented);
      if (dist(point, handle) <= hit * 1.4) {
        onSelectLook(selected.id);
        dragRotate(event, selected.id, selected.oriented);
        return;
      }
      if (pointInPolygon(point, selected.oriented)) {
        onSelectLook(selected.id);
        return;
      }
    }
    const target = createLook(classId);
    const seeded = { ...target, oriented: cornersOf({ x: point.x, y: point.y, w: 1, h: 1 }) };
    const next = [...looks, seeded];
    onSelectLook(seeded.id);
    onEdit(next, "start", seeded.id);
    const move = (moveEvent: PointerEvent) => {
      const end = clamp(toImage(moveEvent.clientX, moveEvent.clientY), imageWidth, imageHeight);
      onEdit(next.map((look) => (look.id === seeded.id ? { ...look, oriented: cornersOf(boxFromDrag(point, end)) } : look)), "move", seeded.id);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEdit(null, "end", seeded.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const drawPose = (event: ReactPointerEvent<HTMLDivElement>, point: Point) => {
    const selected = visible.find((look) => look.id === selectedLookId && look.pose?.length) ?? null;
    if (selected?.pose) {
      const index = nearestPoint(point, selected.pose, hit);
      if (index >= 0) {
        onSelectLook(selected.id);
        onSelect({ lookId: selected.id, field: "pose", index });
        dragPoint(event, selected.id, "pose", index);
        return;
      }
    }
    const target = selected ?? createLook(classId);
    if (target.pose?.length) {
      onSelectLook(target.id);
      return;
    }
    const pose = placePose(point, imageWidth, imageHeight);
    const seeded = { ...target, pose };
    const exists = looks.some((look) => look.id === target.id);
    const next = exists ? looks.map((look) => (look.id === target.id ? seeded : look)) : [...looks, seeded];
    onSelectLook(seeded.id);
    onSelect({ lookId: seeded.id, field: "pose", index: 0 });
    onEdit(next, "start", seeded.id);
    onEdit(null, "end", seeded.id);
  };

  const dragPoint = (event: ReactPointerEvent<HTMLDivElement>, lookId: string, field: Field, index: number, seed?: Look[]) => {
    const base = seed ?? looks;
    onEdit(base, "start", lookId);
    const move = (moveEvent: PointerEvent) => {
      const nextPoint = clamp(toImage(moveEvent.clientX, moveEvent.clientY), imageWidth, imageHeight);
      onEdit(
        base.map((look) => {
          if (look.id !== lookId) return look;
          if (field === "pose") {
            const pose = (look.pose ?? []).map((item, itemIndex) => (itemIndex === index ? { ...item, x: nextPoint.x, y: nextPoint.y, v: item.v === 0 ? 2 : item.v } : item));
            return { ...look, pose };
          }
          const current = fieldPoints(look, field).map((item, itemIndex) => (itemIndex === index ? nextPoint : item));
          return setField(look, field, current);
        }),
        "move",
        lookId,
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEdit(null, "end", lookId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    event.preventDefault();
  };

  const dragBox = (event: ReactPointerEvent<HTMLDivElement>, lookId: string, handle: string) => {
    const origin = looks.find((look) => look.id === lookId)?.box;
    if (!origin) return;
    const start = toImage(event.clientX, event.clientY);
    onEdit(looks, "start", lookId);
    const move = (moveEvent: PointerEvent) => {
      const point = clamp(toImage(moveEvent.clientX, moveEvent.clientY), imageWidth, imageHeight);
      const box = handle === "move" ? moveBox(origin, point.x - start.x, point.y - start.y) : resizeBox(origin, handle, point);
      onEdit(looks.map((look) => (look.id === lookId ? { ...look, box } : look)), "move", lookId);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEdit(null, "end", lookId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const dragRotate = (event: ReactPointerEvent<HTMLDivElement>, lookId: string, origin: Point[]) => {
    const center = centroid(origin);
    const start = toImage(event.clientX, event.clientY);
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    onEdit(looks, "start", lookId);
    const move = (moveEvent: PointerEvent) => {
      const point = toImage(moveEvent.clientX, moveEvent.clientY);
      const angle = Math.atan2(point.y - center.y, point.x - center.x) - startAngle;
      onEdit(looks.map((look) => (look.id === lookId ? { ...look, oriented: rotatePoints(origin, center, angle) } : look)), "move", lookId);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEdit(null, "end", lookId);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={stageRef} className="label-stage" onPointerDown={onPointerDown}>
      <div className="label-image" style={{ left: ox, top: oy, width: imageWidth * scale, height: imageHeight * scale }}>
        <img src={url} alt="" draggable={false} />
        <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} preserveAspectRatio="none">
          {visible.map((look) => (
            <Shape
              key={look.id}
              look={look}
              color={colorOf(look.classId)}
              selected={look.id === selectedLookId}
              selection={selection}
              hit={hit}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function Shape({
  look,
  color,
  selected,
  selection,
  hit,
}: {
  look: Look;
  color: string;
  selected: boolean;
  selection: Selection;
  hit: number;
}) {
  const stroke = selected ? 2.4 : 1.4;
  return (
    <g style={{ color }}>
      {look.points.length > 0 && <Vector points={look.points} stroke={stroke} selected={selected && selection?.field === "points" ? selection.index : -1} hit={hit} />}
      {look.semantic && look.semantic.length > 0 && (
        <Vector points={look.semantic} stroke={stroke} selected={selected && selection?.field === "semantic" ? selection.index : -1} hit={hit} dashed />
      )}
      {look.box && <BoxShape box={look.box} stroke={stroke} />}
      {look.oriented && look.oriented.length >= 4 && (
        <Vector points={look.oriented} stroke={stroke} selected={selected && selection?.field === "oriented" ? selection.index : -1} hit={hit} />
      )}
      {look.oriented && look.oriented.length >= 4 && selected && <circle className="label-handle" cx={rotateHandle(look.oriented).x} cy={rotateHandle(look.oriented).y} r={hit * 0.55} />}
      {look.pose?.map((point, index) =>
        point.v === 0 ? null : (
          <circle
            key={point.name}
            className={point.v === 1 ? "label-point is-hidden" : "label-point"}
            cx={point.x}
            cy={point.y}
            r={selected && selection?.field === "pose" && selection.index === index ? hit * 0.7 : hit * 0.45}
          />
        ),
      )}
    </g>
  );
}

function Vector({ points, stroke, selected, hit, dashed = false }: { points: Point[]; stroke: number; selected: number; hit: number; dashed?: boolean }) {
  const closed = points.length >= 3;
  return (
    <>
      <path d={polygonPath(points, closed)} className={dashed ? "label-vector is-semantic" : "label-vector"} strokeWidth={stroke} vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => (
        <circle key={index} className="label-point" cx={point.x} cy={point.y} r={index === selected ? hit * 0.7 : hit * 0.45} />
      ))}
    </>
  );
}

function BoxShape({ box, stroke }: { box: Box; stroke: number }) {
  return <rect className="label-vector" x={box.x} y={box.y} width={box.w} height={box.h} strokeWidth={stroke} vectorEffect="non-scaling-stroke" />;
}

function fieldPoints(look: Look, field: Field): Point[] {
  if (field === "semantic") return look.semantic ?? [];
  if (field === "oriented") return look.oriented ?? [];
  if (field === "pose") return look.pose ?? [];
  return look.points;
}

function setField(look: Look, field: Field, points: Point[]): Look {
  if (field === "semantic") return { ...look, semantic: points };
  if (field === "oriented") return { ...look, oriented: points };
  return { ...look, points };
}

function findVertex(looks: Look[], selectedId: string | null, field: "points" | "semantic", point: Point, limit: number) {
  const ordered = [...looks].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0));
  for (const look of ordered) {
    const index = nearestPoint(point, fieldPoints(look, field), limit);
    if (index >= 0) return { look, index };
  }
  return null;
}

function createLook(classId: string): Look {
  return { id: crypto.randomUUID(), classId, reason: "", points: [] };
}

function boxHandle(box: Box, point: Point, limit: number) {
  const spots: { name: string; x: number; y: number }[] = [
    { name: "nw", x: box.x, y: box.y },
    { name: "n", x: box.x + box.w / 2, y: box.y },
    { name: "ne", x: box.x + box.w, y: box.y },
    { name: "e", x: box.x + box.w, y: box.y + box.h / 2 },
    { name: "se", x: box.x + box.w, y: box.y + box.h },
    { name: "s", x: box.x + box.w / 2, y: box.y + box.h },
    { name: "sw", x: box.x, y: box.y + box.h },
    { name: "w", x: box.x, y: box.y + box.h / 2 },
  ];
  let best = "";
  let bestDist = limit;
  for (const spot of spots) {
    const gap = dist(point, spot);
    if (gap <= bestDist) {
      best = spot.name;
      bestDist = gap;
    }
  }
  return best;
}

function insideBox(box: Box, point: Point) {
  return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
}

function rotateHandle(points: Point[]): Point {
  const center = centroid(points);
  const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mid.x + (dx / len) * 22, y: mid.y + (dy / len) * 22 };
}

function placePose(origin: Point, width: number, height: number): Keypoint[] {
  return PERSON_POSE.map((point) => ({
    name: point.name,
    x: Math.min(width, Math.max(0, origin.x + point.x)),
    y: Math.min(height, Math.max(0, origin.y + point.y)),
    v: 2 as const,
  }));
}

function clamp(point: Point, width: number, height: number): Point {
  return { x: Math.min(width, Math.max(0, point.x)), y: Math.min(height, Math.max(0, point.y)) };
}
