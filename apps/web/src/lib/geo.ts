import { geometryBBox, type BBox, type LonLat, type StreetFeature } from "@streetwise/core";

/** Union of bounding boxes. */
export function unionBBox(boxes: BBox[]): BBox {
  return boxes.reduce<BBox>(
    (a, b) => [
      Math.min(a[0], b[0]),
      Math.min(a[1], b[1]),
      Math.max(a[2], b[2]),
      Math.max(a[3], b[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/** Grows a bbox around its centre to at least `minMeters` in both directions. */
export function minSizeBBox([w, s, e, n]: BBox, minMeters = 300): BBox {
  const lat = (s + n) / 2;
  const dLat = minMeters / 111_320 / 2;
  const dLon = minMeters / (111_320 * Math.cos((lat * Math.PI) / 180)) / 2;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  return [
    Math.min(w, cx - dLon),
    Math.min(s, cy - dLat),
    Math.max(e, cx + dLon),
    Math.max(n, cy + dLat),
  ];
}

export function streetsBBox(streets: StreetFeature[], minMeters = 300): BBox {
  return minSizeBBox(unionBBox(streets.map((s) => geometryBBox(s.geometry))), minMeters);
}

export function pointBBox(p: LonLat): BBox {
  return [p[0], p[1], p[0], p[1]];
}
