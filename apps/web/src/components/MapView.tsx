import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Map as MLMap,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
// MapLibre 6 loads its worker relative to its own module URL, which breaks after bundling;
// let Vite bundle the worker (with its shared chunk) and hand MapLibre the URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  distanceToGeometry,
  hitTolerance,
  type BBox,
  type LonLat,
  type StreetFeature,
} from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import {
  baseStyle,
  maskPolygon,
  padBounds,
  STATUS_COLORS,
  type StreetStatus,
} from "../lib/mapStyle";
import { useDarkMode } from "../lib/useDarkMode";

setWorkerUrl(workerUrl);

export interface MapMarker {
  key: string;
  at: LonLat;
  text: string;
  /** "sign": street-name sign; "badge": round number badge; "note": small info chip. */
  variant: "sign" | "badge" | "note";
  tone?: "default" | "active" | "correct" | "wrong";
  onClick?: () => void;
}

export interface MapTap {
  at: LonLat;
  /** Nearest drawn street within the tap tolerance, if any. */
  street: StreetFeature | null;
  /** Tap tolerance in metres at the current zoom. */
  tolerance: number;
}

export interface MapViewProps {
  data: CityData;
  /** Streets drawn on top of the base map (and tappable). */
  streetIds: string[];
  status?: Record<string, StreetStatus>;
  /** Area the map is restricted to (initial view and pan limits). */
  area: BBox;
  /** Optional camera target inside the area; the map flies there when it changes. */
  focus?: BBox | null;
  outline?: LonLat[][][];
  onTap?: (tap: MapTap) => void;
  markers?: MapMarker[];
  /** Screen space covered by overlays (header, bottom sheet), kept free when fitting. */
  padding?: { top: number; bottom: number; left: number; right: number };
  /** Show MapLibre's attribution control; pass false when the screen shows attribution itself. */
  attribution?: boolean;
}

const DEFAULT_PADDING = { top: 40, bottom: 40, left: 24, right: 24 };

const colorExpr = [
  "match",
  ["coalesce", ["feature-state", "status"], "idle"],
  ...Object.entries(STATUS_COLORS).flat(),
  STATUS_COLORS.idle,
] as unknown as ExpressionSpecification;

// Zoom must be the top-level interpolation input; the status factor goes into each stop.
const statusFactor = [
  "match",
  ["coalesce", ["feature-state", "status"], "idle"],
  "active",
  1.6,
  "muted",
  0.7,
  1,
];
const widthExpr = (base: [number, number, number]) =>
  [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    ["*", base[0], statusFactor],
    15,
    ["*", base[1], statusFactor],
    18,
    ["*", base[2], statusFactor],
  ] as unknown as ExpressionSpecification;

const inFilter = (geom: "LineString" | "Polygon", ids: string[]) =>
  [
    "all",
    ["==", ["geometry-type"], geom],
    ["in", ["get", "id"], ["literal", ids]],
  ] as unknown as ExpressionSpecification;

const MARKER_CLASS: Record<MapMarker["variant"], string> = {
  sign: "street-sign animate-pop px-3 py-1.5 text-[15px] whitespace-nowrap",
  badge: "map-badge animate-pop",
  note: "map-note animate-pop",
};

export function MapView({
  data,
  streetIds,
  status,
  area,
  focus,
  outline,
  onTap,
  markers,
  padding = DEFAULT_PADDING,
  attribution = true,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dark = useDarkMode();
  const tapRef = useRef(onTap);
  const idsRef = useRef(streetIds);
  useLayoutEffect(() => {
    tapRef.current = onTap;
    idsRef.current = streetIds;
  });

  // Create the map once per theme.
  useEffect(() => {
    const map = new MLMap({
      container: container.current!,
      style: baseStyle({
        city: data.meta.id,
        dark,
        hasTiles: data.hasTiles,
        attribution: data.meta.attribution,
      }),
      bounds: focus ?? area,
      fitBoundsOptions: { padding, maxZoom: 17 },
      maxBounds: padBounds(area),
      attributionControl: attribution
        ? { compact: true, customAttribution: data.meta.attribution }
        : false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 19,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("streets", {
        type: "geojson",
        data: data.streets as unknown as FeatureCollection,
      });
      map.addSource("mask", { type: "geojson", data: maskPolygon(outline ?? []) });
      if (!data.hasTiles) {
        // Without base tiles the city's streets themselves form the map.
        map.addLayer({
          id: "base-streets",
          type: "line",
          source: "streets",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": dark ? "#334155" : "#cbd5e1",
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 4],
          },
        });
      }
      map.addLayer({
        id: "mask",
        type: "fill",
        source: "mask",
        paint: { "fill-color": dark ? "#000" : "#0b1220", "fill-opacity": dark ? 0.45 : 0.28 },
      });
      map.addLayer({
        id: "squares",
        type: "fill",
        source: "streets",
        filter: inFilter("Polygon", idsRef.current),
        paint: {
          "fill-color": colorExpr,
          "fill-opacity": [
            "match",
            ["coalesce", ["feature-state", "status"], "idle"],
            "muted",
            0.25,
            0.5,
          ],
        },
      });
      map.addLayer({
        id: "streets-casing",
        type: "line",
        source: "streets",
        filter: inFilter("LineString", idsRef.current),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": dark ? "#0b1220" : "#ffffff",
          "line-width": widthExpr([4.5, 8, 16]),
        },
      });
      map.addLayer({
        id: "streets",
        type: "line",
        source: "streets",
        filter: inFilter("LineString", idsRef.current),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": colorExpr, "line-width": widthExpr([2.5, 5, 12]) },
      });
    });

    map.on("click", (e: MapMouseEvent) => {
      const cb = tapRef.current;
      if (!cb) return;
      const at: LonLat = [e.lngLat.lng, e.lngLat.lat];
      const r = 24;
      const candidates = map.queryRenderedFeatures(
        [
          [e.point.x - r, e.point.y - r],
          [e.point.x + r, e.point.y + r],
        ],
        { layers: ["streets", "squares"] },
      );
      const tolerance = hitTolerance(map.getZoom(), at[1]);
      let best: StreetFeature | null = null;
      let bestD = Infinity;
      for (const c of candidates) {
        const street = data.streetsById.get(c.properties.id as string);
        if (!street) continue;
        const d = distanceToGeometry(at, street.geometry);
        if (d < bestD) {
          bestD = d;
          best = street;
        }
      }
      cb({ at, street: bestD <= tolerance ? best : null, tolerance });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // area/focus/outline changes are handled below; recreate only for theme or data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dark]);

  // Update drawn streets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setFilter("squares", inFilter("Polygon", streetIds));
      map.setFilter("streets-casing", inFilter("LineString", streetIds));
      map.setFilter("streets", inFilter("LineString", streetIds));
    };
    if (map.getLayer("streets")) apply();
    else map.once("load", apply);
  }, [streetIds, dark]);

  // Per-street status via feature-state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.removeFeatureState({ source: "streets" });
      for (const [id, s] of Object.entries(status ?? {})) {
        const f = data.streetsById.get(id);
        if (f?.id !== undefined)
          map.setFeatureState({ source: "streets", id: f.id }, { status: s });
      }
    };
    if (map.getSource("streets") && map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [status, data, dark]);

  // Area changes: new limits, dimming and view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMaxBounds(padBounds(area));
    (map.getSource("mask") as GeoJSONSource | undefined)?.setData(maskPolygon(outline ?? []));
  }, [area, outline]);

  // Camera follows the focus (or the whole area).
  const focusKey = JSON.stringify(focus ?? area);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(focus ?? area, { padding, duration: 700, maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // HTML markers: street signs, number badges, notes (no glyphs needed).
  const markersKey = JSON.stringify(
    markers?.map((m) => [m.key, m.at, m.text, m.variant, m.tone]) ?? [],
  );
  const markersRef = useRef(markers);
  useLayoutEffect(() => {
    markersRef.current = markers;
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const created = (markersRef.current ?? []).map((m) => {
      const el = document.createElement(m.onClick ? "button" : "div");
      el.className = `${MARKER_CLASS[m.variant]} ${m.tone ? `tone-${m.tone}` : ""} ${m.onClick ? "" : "pointer-events-none"}`;
      el.textContent = m.text;
      if (m.onClick) {
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          markersRef.current?.find((x) => x.key === m.key)?.onClick?.();
        });
      }
      const anchor = m.variant === "sign" ? "bottom" : "center";
      return new Marker({ element: el, anchor, offset: m.variant === "sign" ? [0, -14] : [0, 0] })
        .setLngLat(m.at)
        .addTo(map);
    });
    return () => created.forEach((mk) => mk.remove());
  }, [markersKey, dark]);

  // MapLibre sets `position: relative` on its container, so it needs a sized wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
