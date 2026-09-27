import type { LonLat } from "@streetwise/core";

const RAD = Math.PI / 180;
const R = 6371008.8;

/** Douglas–Peucker in a local metric projection; `tolerance` in metres. */
export function simplifyLine(points: LonLat[], tolerance: number): LonLat[] {
  if (points.length <= 2) return points;
  const lat0 = points[0]![1] * RAD;
  const xy = points.map(([lon, lat]) => [lon * RAD * R * Math.cos(lat0), lat * RAD * R] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a]!;
    const [bx, by] = xy[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]!;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function roundCoords(points: LonLat[], digits = 6): LonLat[] {
  const f = 10 ** digits;
  return points.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f]);
}

export function lineLength(points: LonLat[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!;
    const [x2, y2] = points[i]!;
    const lat = ((y1 + y2) / 2) * RAD;
    sum += Math.hypot((x2 - x1) * RAD * R * Math.cos(lat), (y2 - y1) * RAD * R);
  }
  return sum;
}
