import {
  distanceToGeometry,
  normalizeName,
  pointInPolygon,
  type LonLat,
  type StreetGeometry,
  type StreetKind,
} from "@streetwise/core";
import { relationPolygons, toLonLat, type OverpassElement } from "./osm";
import { lineLength } from "./simplify";

const MAJOR = new Set([
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);
const MINOR = new Set(["unclassified", "residential", "living_street", "pedestrian", "road"]);
const PATH = new Set(["service"]);
export const HIGHWAY_REGEX =
  "^(trunk|primary|secondary|tertiary|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|pedestrian|road|service)$";

/** One OSM way/relation after filtering. */
export interface Piece {
  name: string;
  kind: StreetKind;
  lines: LonLat[][];
  polygons: LonLat[][][];
}

/** A merged street: all pieces with the same name that belong together spatially. */
export interface MergedStreet {
  name: string;
  kind: StreetKind;
  lines: LonLat[][];
  polygons: LonLat[][][];
  length: number;
}

const KIND_RANK: Record<StreetKind, number> = { square: 3, major: 3, minor: 2, path: 1 };

function isClosed(line: LonLat[]) {
  const a = line[0]!;
  const b = line[line.length - 1]!;
  return line.length >= 4 && a[0] === b[0] && a[1] === b[1];
}

export function piecesFromOverpass(elements: OverpassElement[]): Piece[] {
  const out: Piece[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;
    const square =
      tags.place === "square" || (tags.highway === "pedestrian" && tags.area === "yes");
    if (el.type === "way") {
      const line = toLonLat(el.geometry);
      if (square && isClosed(line))
        out.push({ name, kind: "square", lines: [], polygons: [[line]] });
      else if (tags.highway) {
        const hw = tags.highway;
        const kind: StreetKind | null = MAJOR.has(hw)
          ? "major"
          : MINOR.has(hw)
            ? "minor"
            : PATH.has(hw)
              ? "path"
              : null;
        if (kind && tags.area !== "yes") out.push({ name, kind, lines: [line], polygons: [] });
      }
    } else if (el.type === "relation" && square) {
      const polygons = relationPolygons(el);
      if (polygons.length) out.push({ name, kind: "square", lines: [], polygons });
    }
  }
  return out;
}

function pieceGeometry(p: { lines: LonLat[][]; polygons: LonLat[][][] }): StreetGeometry[] {
  return [
    ...p.lines.map((l) => ({ type: "LineString" as const, coordinates: l })),
    ...p.polygons.map((poly) => ({ type: "Polygon" as const, coordinates: poly })),
  ];
}

function pieceDistance(a: Piece, b: Piece): number {
  const gb = pieceGeometry(b);
  let min = Infinity;
  const pts = [...a.lines.flat(), ...a.polygons.flatMap((p) => p[0] ?? [])];
  for (const pt of pts) for (const g of gb) min = Math.min(min, distanceToGeometry(pt, g));
  return min;
}

/**
 * Groups pieces by normalised name and merges those closer than `maxGap` metres. A square
 * polygon absorbs same-named lines (pedestrian ways across a square).
 */
export function mergePieces(pieces: Piece[], maxGap = 150): MergedStreet[] {
  const byName = new Map<string, Piece[]>();
  for (const p of pieces) {
    const k = normalizeName(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const out: MergedStreet[] = [];
  for (const group of byName.values()) {
    // union-find over pieces
    const parent = group.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        if (find(i) !== find(j) && pieceDistance(group[i]!, group[j]!) <= maxGap)
          parent[find(i)] = find(j);
    const clusters = new Map<number, Piece[]>();
    group.forEach((p, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), p]));
    for (const members of clusters.values()) {
      const polygons = members.flatMap((m) => m.polygons);
      const lines = polygons.length ? [] : members.flatMap((m) => m.lines);
      const kind: StreetKind = polygons.length
        ? "square"
        : members.reduce<StreetKind>(
            (k, m) => (KIND_RANK[m.kind] > KIND_RANK[k] ? m.kind : k),
            "path",
          );
      // Most common spelling wins as display name.
      const counts = new Map<string, number>();
      for (const m of members) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
      const name = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]![0];
      out.push({
        name,
        kind,
        lines,
        polygons,
        length: lines.reduce((s, l) => s + lineLength(l), 0),
      });
    }
  }
  return out;
}

/** Vertices weighted by the length they represent; used for centres and district shares. */
export function samplePoints(
  s: Pick<MergedStreet, "lines" | "polygons">,
): { p: LonLat; w: number }[] {
  if (s.polygons.length)
    return s.polygons.flatMap((poly) => (poly[0] ?? []).slice(1).map((p) => ({ p, w: 1 })));
  const out: { p: LonLat; w: number }[] = [];
  for (const l of s.lines)
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1]!;
      const b = l[i]!;
      out.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w: lineLength([a, b]) || 1e-6 });
    }
  return out;
}

/** Representative point: the sample closest to the weighted mean (always on the street). */
export function streetCenter(s: Pick<MergedStreet, "lines" | "polygons">): LonLat {
  const pts = samplePoints(s);
  const tw = pts.reduce((a, x) => a + x.w, 0);
  const mean: LonLat = [
    pts.reduce((a, x) => a + x.p[0] * x.w, 0) / tw,
    pts.reduce((a, x) => a + x.p[1] * x.w, 0) / tw,
  ];
  if (s.polygons.length) return mean;
  let best = pts[0]!.p;
  let bd = Infinity;
  for (const { p } of pts) {
    const d = (p[0] - mean[0]) ** 2 + (p[1] - mean[1]) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Index of the district polygon containing most of the street, or -1. */
export function assignDistrict(
  s: Pick<MergedStreet, "lines" | "polygons">,
  districts: LonLat[][][][],
): number {
  const share = new Array<number>(districts.length).fill(0);
  for (const { p, w } of samplePoints(s)) {
    const i = districts.findIndex((polys) => polys.some((poly) => pointInPolygon(p, poly)));
    if (i >= 0) share[i]! += w;
  }
  const max = Math.max(...share);
  return max > 0 ? share.indexOf(max) : -1;
}

export function importance(s: Pick<MergedStreet, "kind" | "length">): number {
  const base = { square: 3000, major: 3000, minor: 1000, path: 0 }[s.kind];
  return Math.round(base + Math.min(s.length, 2000) / 2);
}

/** Stable id from name + rough location (~500 m grid), FNV-1a, base36. */
export function streetId(name: string, center: LonLat): string {
  const key = `${normalizeName(name)}@${Math.round(center[0] * 200)}:${Math.round(center[1] * 200)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}
