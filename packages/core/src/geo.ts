import type { LonLat, StreetGeometry } from "./types";

const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export function haversine(a: LonLat, b: LonLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/** Local equirectangular projection around `origin`, in metres. Accurate enough at city scale. */
function project(p: LonLat, origin: LonLat): [number, number] {
  return [
    (p[0] - origin[0]) * RAD * EARTH_RADIUS * Math.cos(origin[1] * RAD),
    (p[1] - origin[1]) * RAD * EARTH_RADIUS,
  ];
}

function pointSegmentDistance(p: LonLat, a: LonLat, b: LonLat): number {
  const [bx, by] = project(b, a);
  const [px, py] = project(p, a);
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

function lineDistance(p: LonLat, line: readonly LonLat[]): number {
  if (line.length === 1) return haversine(p, line[0]!);
  let min = Infinity;
  for (let i = 1; i < line.length; i++)
    min = Math.min(min, pointSegmentDistance(p, line[i - 1]!, line[i]!));
  return min;
}

function inRing(p: LonLat, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: LonLat, polygon: readonly (readonly LonLat[])[]): boolean {
  const [outer, ...holes] = polygon;
  return !!outer && inRing(p, outer) && !holes.some((h) => inRing(p, h));
}

/** Distance in metres from a point to a street geometry (0 inside a square). */
export function distanceToGeometry(p: LonLat, g: StreetGeometry): number {
  switch (g.type) {
    case "LineString":
      return lineDistance(p, g.coordinates);
    case "MultiLineString":
      return Math.min(...g.coordinates.map((l) => lineDistance(p, l)));
    case "Polygon":
      return pointInPolygon(p, g.coordinates)
        ? 0
        : Math.min(...g.coordinates.map((r) => lineDistance(p, r)));
    case "MultiPolygon":
      return Math.min(
        ...g.coordinates.map((poly) =>
          distanceToGeometry(p, { type: "Polygon", coordinates: poly }),
        ),
      );
  }
}

/**
 * Hit tolerance for tapping a street: at least `minMeters`, but never smaller than
 * `minPixels` on screen at the current zoom (REQUIREMENTS: ~25 m, zoom dependent).
 */
export function hitTolerance(
  zoom: number,
  latitude: number,
  minMeters = 25,
  minPixels = 22,
): number {
  const metersPerPixel = (156543.03392 * Math.cos(latitude * RAD)) / 2 ** zoom / 2; // 512px tiles
  return Math.max(minMeters, minPixels * metersPerPixel);
}
