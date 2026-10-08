import type { Box, Point } from "./types";

export function pointInPolygon(point: Point, polygon: Point[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const hit = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

export function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearestPoint(point: Point, polygon: Point[], limit: number) {
  let best = -1;
  let bestDist = limit;
  polygon.forEach((item, index) => {
    const gap = dist(point, item);
    if (gap <= bestDist) {
      best = index;
      bestDist = gap;
    }
  });
  return best;
}

export function nearestEdge(point: Point, polygon: Point[], limit: number) {
  if (polygon.length < 2) return -1;
  let best = -1;
  let bestDist = limit;
  const closed = polygon.length >= 3;
  const count = closed ? polygon.length : polygon.length - 1;
  for (let i = 0; i < count; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const gap = distanceToSegment(point, a, b);
    if (gap <= bestDist) {
      best = i;
      bestDist = gap;
    }
  }
  return best;
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len === 0) return dist(point, a);
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len));
  return dist(point, { x: a.x + t * dx, y: a.y + t * dy });
}

export function normalizePoints(points: Point[], width: number, height: number) {
  if (width <= 0 || height <= 0) return [];
  return points.flatMap((point) => [clamp01(point.x / width), clamp01(point.y / height)]);
}

export function normalizeBox(box: Box, width: number, height: number) {
  const cx = (box.x + box.w / 2) / width;
  const cy = (box.y + box.h / 2) / height;
  return [clamp01(cx), clamp01(cy), clamp01(box.w / width), clamp01(box.h / height)];
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function polygonPath(points: Point[], closed: boolean) {
  if (points.length === 0) return "";
  const head = `M ${points[0].x} ${points[0].y}`;
  const rest = points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ");
  return closed && points.length >= 3 ? `${head} ${rest} Z` : `${head} ${rest}`;
}

export function boxFromDrag(start: Point, end: Point): Box {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { x, y, w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
}

export function resizeBox(box: Box, handle: string, point: Point): Box {
  let x = box.x;
  let y = box.y;
  let r = box.x + box.w;
  let b = box.y + box.h;
  if (handle.includes("w")) x = Math.min(point.x, r - 4);
  if (handle.includes("e")) r = Math.max(point.x, x + 4);
  if (handle.includes("n")) y = Math.min(point.y, b - 4);
  if (handle.includes("s")) b = Math.max(point.y, y + 4);
  return { x, y, w: r - x, h: b - y };
}

export function moveBox(box: Box, dx: number, dy: number): Box {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

export function cornersOf(box: Box): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
}

export function rotatePoints(points: Point[], center: Point, radians: number): Point[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
  });
}

export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let max = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const gap = distanceToSegment(points[i], start, end);
    if (gap > max) {
      max = gap;
      index = i;
    }
  }
  if (max <= epsilon) return [start, end];
  const left = rdp(points.slice(0, index + 1), epsilon);
  const right = rdp(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}
