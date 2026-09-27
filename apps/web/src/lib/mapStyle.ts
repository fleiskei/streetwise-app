import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import type { BBox, LonLat } from "@streetwise/core";
import type { Feature, Polygon } from "geojson";

export const STATUS_COLORS = {
  idle: "#3b82f6",
  active: "#f59e0b",
  correct: "#16a34a",
  wrong: "#dc2626",
  mastered: "#0d9488",
  /** Part of the area but not in focus. */
  muted: "#94a3b8",
} as const;
export type StreetStatus = keyof typeof STATUS_COLORS;

/**
 * Label-free base style: Protomaps basemap layers without any symbol layer (no street,
 * place or POI names, no house numbers — REQUIREMENTS F-1).
 */
export function baseStyle(opts: {
  city: string;
  dark: boolean;
  hasTiles: boolean;
  attribution: string;
}): StyleSpecification {
  const flavor = namedFlavor(opts.dark ? "dark" : "light");
  const base: LayerSpecification[] = opts.hasTiles
    ? (layers("protomaps", flavor) as LayerSpecification[]).filter(
        (l) => l.type !== "symbol" && !l.id.startsWith("boundaries"),
      )
    : [{ id: "background", type: "background", paint: { "background-color": flavor.background } }];
  return {
    version: 8,
    sources: opts.hasTiles
      ? {
          protomaps: {
            type: "vector",
            tiles: [`${window.location.origin}/tiles/${opts.city}/{z}/{x}/{y}.mvt`],
            maxzoom: 15,
            attribution: opts.attribution,
          },
        }
      : {},
    layers: base,
  };
}

/** World polygon with the given outlines cut out, used to dim everything outside the area. */
export function maskPolygon(outline: LonLat[][][]): Feature<Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        ...outline.map((poly) => poly[0]!),
      ],
    },
  };
}

/**
 * Pan/zoom limits: the whole city plus the same margin the tile extraction uses
 * (tools/tiles), so one can zoom out to the entire city without leaving the tiles.
 */
export function cityLimits([w, s, e, n]: BBox, marginDeg = 0.01): BBox {
  return [w - marginDeg, s - marginDeg, e + marginDeg, n + marginDeg];
}
