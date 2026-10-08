import { pointInPolygon, rdp } from "./geometry";
import type { Point } from "./types";

const MAX_SIDE = 280;

export function proposeOutline(image: ImageData, click: Point, existing: Point[]): Point[] {
  const scale = MAX_SIDE / Math.max(image.width, image.height, 1);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const small = downsample(image, w, h);
  const sx = Math.min(w - 1, Math.max(0, Math.round(click.x * scale)));
  const sy = Math.min(h - 1, Math.max(0, Math.round(click.y * scale)));
  const grown = flood(small, w, h, sx, sy);
  if (!grown) return fallbackRing(click);

  const mask = new Uint8Array(w * h);
  rasterPolygon(mask, w, h, existing.map((point) => ({ x: point.x * scale, y: point.y * scale })));
  const inside = existing.length >= 3 && pointInPolygon(click, existing);
  for (let i = 0; i < mask.length; i++) {
    if (inside) mask[i] = mask[i] && !grown[i] ? 1 : 0;
    else if (grown[i]) mask[i] = 1;
  }
  const raw = trace(mask, w, h);
  if (raw.length < 3) return inside ? existing : fallbackRing(click);
  const simplified = rdp([...raw, raw[0]], 1.6).slice(0, -1);
  const unique = simplified.filter((point, index) => index === 0 || point.x !== simplified[index - 1].x || point.y !== simplified[index - 1].y);
  if (unique.length < 3) return inside ? existing : fallbackRing(click);
  return unique.map((point) => ({ x: point.x / scale, y: point.y / scale }));
}

function downsample(image: ImageData, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y / h) * image.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x / w) * image.width));
      const from = (sy * image.width + sx) * 4;
      const to = (y * w + x) * 4;
      out[to] = image.data[from];
      out[to + 1] = image.data[from + 1];
      out[to + 2] = image.data[from + 2];
      out[to + 3] = 255;
    }
  }
  return out;
}

function flood(data: Uint8ClampedArray, w: number, h: number, sx: number, sy: number) {
  const start = (sy * w + sx) * 4;
  const sr = data[start];
  const sg = data[start + 1];
  const sb = data[start + 2];
  for (const tolerance of [22, 40, 58]) {
    const mask = new Uint8Array(w * h);
    const stack = [sx, sy];
    mask[sy * w + sx] = 1;
    let count = 1;
    const limit = Math.floor(w * h * 0.45);
    while (stack.length) {
      const y = stack.pop()!;
      const x = stack.pop()!;
      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const index = ny * w + nx;
        if (mask[index]) continue;
        const pixel = index * 4;
        if (Math.abs(data[pixel] - sr) + Math.abs(data[pixel + 1] - sg) + Math.abs(data[pixel + 2] - sb) > tolerance) continue;
        mask[index] = 1;
        count += 1;
        if (count > limit) break;
        stack.push(nx, ny);
      }
      if (count > limit) break;
    }
    if (count > 12 && count <= limit) return mask;
  }
  return null;
}

function rasterPolygon(mask: Uint8Array, w: number, h: number, points: Point[]) {
  if (points.length < 3) return;
  for (let y = 0; y < h; y++) {
    const hits: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j];
      const b = points[i];
      if (a.y > y === b.y > y) continue;
      const x = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      hits.push(x);
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const from = Math.max(0, Math.ceil(hits[i]));
      const to = Math.min(w - 1, Math.floor(hits[i + 1]));
      for (let x = from; x <= to; x++) mask[y * w + x] = 1;
    }
  }
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

export function trace(mask: Uint8Array, w: number, h: number): Point[] {
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h && sx < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];
  const points: Point[] = [];
  let x = sx;
  let y = sy;
  let dir = 6;
  const limit = Math.min(mask.length, 8000);
  for (let step = 0; step < limit; step++) {
    points.push({ x, y });
    let next = -1;
    for (let turn = 0; turn < 8; turn++) {
      const nd = (dir + turn) % 8;
      const nx = x + DX[nd];
      const ny = y + DY[nd];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (mask[ny * w + nx]) {
        next = nd;
        x = nx;
        y = ny;
        dir = (nd + 6) % 8;
        break;
      }
    }
    if (next < 0) break;
    if (points.length > 2 && x === sx && y === sy) break;
  }
  return points;
}

function fallbackRing(center: Point): Point[] {
  const radius = 36;
  return Array.from({ length: 12 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 12;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius * 0.72 };
  });
}
