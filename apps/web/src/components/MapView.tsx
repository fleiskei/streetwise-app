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

export interface MapViewProps {
  data: CityData;
  /** Streets that take part (highlighted and tappable). */
  streetIds: string[];
  status?: Record<string, StreetStatus>;
  focus: BBox;
  outline?: LonLat[][][];
  onStreetTap?: (street: StreetFeature | null, at: LonLat) => void;
  /** A street-sign label shown on the map, e.g. the revealed name. */
  label?: { at: LonLat; text: string } | null;
  /** Screen space covered by overlays (header, bottom sheet), kept free when fitting the area. */
  padding?: { top: number; bottom: number; left: number; right: number };
  /** Show MapLibre's attribution control; pass false when the screen shows attribution itself. */
  attribution?: boolean;
}

const DEFAULT_PADDING = { top: 40, bottom: 40, left: 24, right: 24 };

const statusExpr = (prop: "color" | "width") =>
  prop === "color"
    ? ([
        "match",
        ["coalesce", ["feature-state", "status"], "idle"],
        ...Object.entries(STATUS_COLORS).flat(),
        STATUS_COLORS.idle,
      ] as unknown as ExpressionSpecification)
    : (["interpolate", ["linear"], ["zoom"], 12, 2.5, 15, 5, 18, 12] as ExpressionSpecification);

export function MapView({
  data,
  streetIds,
  status,
  focus,
  outline,
  onStreetTap,
  label,
  padding = DEFAULT_PADDING,
  attribution = true,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dark = useDarkMode();
  const tapRef = useRef(onStreetTap);
  const idsRef = useRef(streetIds);
  useLayoutEffect(() => {
    tapRef.current = onStreetTap;
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
      bounds: focus,
      fitBoundsOptions: { padding },
      maxBounds: padBounds(focus),
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
        filter: [
          "all",
          ["==", ["geometry-type"], "Polygon"],
          ["in", ["get", "id"], ["literal", idsRef.current]],
        ],
        paint: { "fill-color": statusExpr("color"), "fill-opacity": 0.45 },
      });
      map.addLayer({
        id: "streets-casing",
        type: "line",
        source: "streets",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["in", ["get", "id"], ["literal", idsRef.current]],
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": dark ? "#0b1220" : "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 15, 8, 18, 16],
        },
      });
      map.addLayer({
        id: "streets",
        type: "line",
        source: "streets",
        filter: [
          "all",
          ["==", ["geometry-type"], "LineString"],
          ["in", ["get", "id"], ["literal", idsRef.current]],
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": statusExpr("color"), "line-width": statusExpr("width") },
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
      cb(bestD <= tolerance ? best : null, at);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // focus/outline changes are handled below; recreate only for theme or data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dark]);

  // Update participating streets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      for (const id of ["squares", "streets-casing", "streets"]) {
        const geom = id === "squares" ? "Polygon" : "LineString";
        map.setFilter(id, [
          "all",
          ["==", ["geometry-type"], geom],
          ["in", ["get", "id"], ["literal", streetIds]],
        ]);
      }
    };
    if (map.getLayer("streets")) apply();
    else map.once("load", apply);
  }, [streetIds]);

  // Update per-street status via feature-state.
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
  }, [status, data]);

  // Refocus when the area changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMaxBounds(padBounds(focus));
    map.fitBounds(focus, { padding, duration: 600 });
    const src = map.getSource("mask") as GeoJSONSource | undefined;
    src?.setData(maskPolygon(outline ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, outline]);

  // Street-sign label as an HTML marker (no glyphs needed, styled like a German street sign).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !label) return;
    const el = document.createElement("div");
    el.className =
      "street-sign animate-pop px-3 py-1.5 text-[15px] whitespace-nowrap pointer-events-none";
    el.textContent = label.text;
    const marker = new Marker({ element: el, anchor: "bottom", offset: [0, -14] })
      .setLngLat(label.at)
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [label, dark]);

  // MapLibre sets `position: relative` on its container, so it needs a sized wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
