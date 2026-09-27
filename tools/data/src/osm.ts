/** Minimal types for Overpass JSON with `out geom;` and helpers to turn it into geometries. */
import type { LonLat } from "@streetwise/core";

export interface OverpassNodeRef {
  lat: number;
  lon: number;
}

export interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry: OverpassNodeRef[];
}

export interface OverpassRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members: { type: string; ref: number; role: string; geometry?: OverpassNodeRef[] }[];
}

export type OverpassElement =
  | OverpassWay
  | OverpassRelation
  | { type: "node" | "area"; id: number; tags?: Record<string, string> };

export interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements: OverpassElement[];
}

export const toLonLat = (g: OverpassNodeRef[]): LonLat[] => g.map((n) => [n.lon, n.lat]);

const samePoint = (a: LonLat, b: LonLat) => a[0] === b[0] && a[1] === b[1];

/**
 * Joins way fragments into closed rings (the usual multipolygon assembly). Fragments that
 * cannot be closed are dropped.
 */
export function assembleRings(fragments: LonLat[][]): LonLat[][] {
  const pending = fragments.filter((f) => f.length >= 2).map((f) => [...f]);
  const rings: LonLat[][] = [];
  while (pending.length) {
    let ring = pending.shift()!;
    let progress = true;
    while (!samePoint(ring[0]!, ring[ring.length - 1]!) && progress) {
      progress = false;
      const end = ring[ring.length - 1]!;
      for (let i = 0; i < pending.length; i++) {
        const f = pending[i]!;
        if (samePoint(f[0]!, end)) ring = ring.concat(f.slice(1));
        else if (samePoint(f[f.length - 1]!, end)) ring = ring.concat([...f].reverse().slice(1));
        else continue;
        pending.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (ring.length >= 4 && samePoint(ring[0]!, ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

/** Polygons (outer + holes) from a multipolygon/boundary relation. */
export function relationPolygons(rel: OverpassRelation): LonLat[][][] {
  const byRole = (role: string) =>
    rel.members
      .filter(
        (m) =>
          m.type === "way" &&
          m.geometry &&
          (m.role === role || (role === "outer" && m.role === "")),
      )
      .map((m) => toLonLat(m.geometry!));
  const outers = assembleRings(byRole("outer"));
  const inners = assembleRings(byRole("inner"));
  const polygons: LonLat[][][] = outers.map((o) => [o]);
  for (const inner of inners) {
    const host = polygons.find((p) => ringContains(p[0]!, inner[0]!));
    host?.push(inner);
  }
  return polygons;
}

export function ringContains(ring: LonLat[], p: LonLat): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
