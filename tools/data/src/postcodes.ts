import { distanceToGeometry, pointInPolygon, type LonLat } from "@streetwise/core";
import { lineLength } from "./simplify";
import { samplePoints, type MergedStreet } from "./streets";

export interface PostcodeArea {
  code: string;
  polys: LonLat[][][];
}

/** Minimum share of a street's length inside an area for the postcode to count (E4.1). */
export const MIN_SHARE = 0.05;

/** Postcodes of a street, largest length share first; shares below MIN_SHARE are ignored. */
export function assignPostcodes(
  s: Pick<MergedStreet, "lines" | "polygons">,
  areas: PostcodeArea[],
): string[] {
  const share = new Map<string, number>();
  let total = 0;
  for (const { p, w } of densePoints(s)) {
    total += w;
    const a = areas.find((x) => x.polys.some((poly) => pointInPolygon(p, poly)));
    if (a) share.set(a.code, (share.get(a.code) ?? 0) + w);
  }
  if (total === 0) return [];
  return [...share.entries()]
    .filter(([, w]) => w / total >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code]) => code);
}

/** Points every ~20 m along the lines (segment midpoints alone are too coarse for shares). */
function densePoints(
  s: Pick<MergedStreet, "lines" | "polygons">,
  step = 20,
): { p: LonLat; w: number }[] {
  if (s.polygons.length) return samplePoints(s);
  const out: { p: LonLat; w: number }[] = [];
  for (const l of s.lines)
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1]!;
      const b = l[i]!;
      const len = lineLength([a, b]);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], w: len / n || 1e-6 });
      }
    }
  return out;
}

/**
 * Label point of an area: on a grid over the largest polygon, the inside point farthest from
 * the boundary (a coarse "pole of inaccessibility", keeps labels away from edges).
 */
export function labelPoint(polys: LonLat[][][], steps = 24): LonLat {
  const area = (ring: LonLat[]) =>
    Math.abs(
      ring.reduce((s, [x, y], i) => {
        const [x2, y2] = ring[(i + 1) % ring.length]!;
        return s + x * y2 - x2 * y;
      }, 0),
    );
  const poly = [...polys].sort((a, b) => area(b[0]!) - area(a[0]!))[0]!;
  const xs = poly[0]!.map((p) => p[0]);
  const ys = poly[0]!.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best: LonLat = poly[0]![0]!;
  let bestD = -1;
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps; j++) {
      const p: LonLat = [w + ((e - w) * i) / steps, s + ((n - s) * j) / steps];
      if (!pointInPolygon(p, poly)) continue;
      const d = Math.min(
        ...poly.map((ring) => distanceToGeometry(p, { type: "LineString", coordinates: ring })),
      );
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}
