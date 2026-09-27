import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  type PostcodeFeature,
  type StreetFeature,
} from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import {
  baseStyle,
  maskPolygon,
  cityLimits,
  STATUS_COLORS,
  type StreetStatus,
} from "../lib/mapStyle";
import { useDarkMode } from "../lib/useDarkMode";
import { registerAerial } from "../lib/aerial";
import { updateSettings, useSettings } from "../lib/settings";

setWorkerUrl(workerUrl);

export interface MapMarker {
  key: string;
  at: LonLat;
  text: string;
  /** "sign": street-name sign; "badge": round number badge; "note": small info chip. */
  variant: "sign" | "badge" | "note" | "plz";
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
  /** Area of the round: initial view (the map can still be moved across the whole city). */
  area: BBox;
  /** Optional camera target inside the area; the map flies there when it changes. */
  focus?: BBox | null;
  /** Area to keep bright; everything outside is dimmed. Omit (or empty) for no dimming. */
  outline?: LonLat[][][];
  onTap?: (tap: MapTap) => void;
  markers?: MapMarker[];
  /** Screen space covered by overlays (header, bottom sheet), kept free when fitting. */
  padding?: { top: number; bottom: number; left: number; right: number };
  /** Show MapLibre's attribution control; pass false when the screen shows attribution itself. */
  attribution?: boolean;
  /** Status of drawn streets without an explicit entry in `status`. */
  baseStatus?: StreetStatus;
  /** Postcode areas to outline and label (e.g. the answer in "PLZ zuordnen"). */
  areas?: PostcodeFeature[];
  /** Offer the "PLZ" button that shows all postcode areas (city map, E4.5). */
  postcodeToggle?: boolean;
  /** Called after the map stopped moving: centre of the free (unpadded) area and visible bounds. */
  onMoveEnd?: (center: LonLat, bounds: BBox) => void;
}

const DEFAULT_PADDING = { top: 40, bottom: 40, left: 24, right: 24 };

const statusOf = (base: StreetStatus) => ["coalesce", ["feature-state", "status"], base];
const colorExpr = (base: StreetStatus) =>
  [
    "match",
    statusOf(base),
    ...Object.entries(STATUS_COLORS).flat(),
    STATUS_COLORS.idle,
  ] as unknown as ExpressionSpecification;
const fillOpacityExpr = (base: StreetStatus) =>
  ["match", statusOf(base), "muted", 0.25, 0.5] as unknown as ExpressionSpecification;

// Zoom must be the top-level interpolation input; the status factor goes into each stop.
const widthExpr = (base: [number, number, number], baseStatus: StreetStatus) => {
  const factor = ["match", statusOf(baseStatus), "active", 1.6, "muted", 0.7, 1];
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    12,
    ["*", base[0], factor],
    15,
    ["*", base[1], factor],
    18,
    ["*", base[2], factor],
  ] as unknown as ExpressionSpecification;
};
const CASING_WIDTH: [number, number, number] = [4.5, 8, 16];
const LINE_WIDTH: [number, number, number] = [2.5, 5, 12];

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
  plz: "map-plz animate-pop",
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
  baseStatus = "idle",
  onMoveEnd,
  areas,
  postcodeToggle = false,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dark = useDarkMode();
  const settings = useSettings();
  const [online, setOnline] = useState(() => navigator.onLine);
  // Aerial imagery is online only; fall back to the drawn map when offline.
  const showAerial = !!data.meta.aerial && settings.aerial && online;
  const aerialRef = useRef(showAerial);
  const showPostcodes = postcodeToggle && settings.postcodes && data.postcodes.length > 0;
  const shownAreas = areas ?? (showPostcodes ? data.postcodes : []);
  const shownAreasRef = useRef(shownAreas);
  const tapRef = useRef(onTap);
  const idsRef = useRef(streetIds);
  const baseRef = useRef(baseStatus);
  const moveRef = useRef(onMoveEnd);
  const paddingRef = useRef(padding);
  useLayoutEffect(() => {
    tapRef.current = onTap;
    idsRef.current = streetIds;
    baseRef.current = baseStatus;
    moveRef.current = onMoveEnd;
    paddingRef.current = padding;
    aerialRef.current = showAerial;
    shownAreasRef.current = shownAreas;
  });

  // Postcode areas: outlines + big labels (HTML markers).
  const areasKey = shownAreas.map((a) => a.properties.code).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("areas") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: shownAreasRef.current,
      } as unknown as FeatureCollection);
    if (map.getSource("areas")) apply();
    else map.once("load", apply);
    // Big labels only for the overview (PLZ button); in quizzes the street sign names the code.
    const labels = (areas ? [] : shownAreasRef.current).map((a) => {
      const el = document.createElement("div");
      el.className = MARKER_CLASS.plz + " pointer-events-none";
      el.textContent = a.properties.code;
      return new Marker({ element: el, anchor: "center" }).setLngLat(a.properties.label).addTo(map);
    });
    return () => labels.forEach((m) => m.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areasKey, dark]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Toggle aerial imagery.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("aerial"))
        map.setLayoutProperty("aerial", "visibility", showAerial ? "visible" : "none");
    };
    if (map.getLayer("streets")) apply();
    else map.once("load", apply);
  }, [showAerial, dark]);

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
      maxBounds: cityLimits(data.meta.bounds),
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
      const aerial = data.meta.aerial;
      if (aerial) {
        registerAerial(aerial);
        map.addSource("aerial", {
          type: "raster",
          tiles: ["aerial://{z}/{x}/{y}"],
          tileSize: 256,
          minzoom: aerial.minzoom,
          maxzoom: aerial.maxzoom,
          attribution: aerial.attribution,
        });
        map.addLayer({
          id: "aerial",
          type: "raster",
          source: "aerial",
          layout: { visibility: aerialRef.current ? "visible" : "none" },
        });
      }
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
        layout: { visibility: outline?.length ? "visible" : "none" },
      });
      map.addSource("areas", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: shownAreasRef.current,
        } as unknown as FeatureCollection,
      });
      map.addLayer({
        id: "areas-fill",
        type: "fill",
        source: "areas",
        paint: { "fill-color": "#7c3aed", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "areas-line",
        type: "line",
        source: "areas",
        paint: {
          "line-color": "#7c3aed",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 3.5],
          "line-dasharray": [2, 1.5],
        },
      });
      map.addLayer({
        id: "squares",
        type: "fill",
        source: "streets",
        filter: inFilter("Polygon", idsRef.current),
        paint: {
          "fill-color": colorExpr(baseRef.current),
          "fill-opacity": fillOpacityExpr(baseRef.current),
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
          "line-width": widthExpr(CASING_WIDTH, baseRef.current),
        },
      });
      map.addLayer({
        id: "streets",
        type: "line",
        source: "streets",
        filter: inFilter("LineString", idsRef.current),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": colorExpr(baseRef.current),
          "line-width": widthExpr(LINE_WIDTH, baseRef.current),
        },
      });
    });

    map.on("moveend", () => {
      const cb = moveRef.current;
      if (!cb) return;
      const p = paddingRef.current;
      const c = map.getContainer();
      const x = (p.left + c.clientWidth - p.right) / 2;
      const y = (p.top + c.clientHeight - p.bottom) / 2;
      const ll = map.unproject([x, y]);
      const b = map.getBounds();
      cb([ll.lng, ll.lat], [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
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

  // Default status of drawn streets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setPaintProperty("squares", "fill-color", colorExpr(baseStatus));
      map.setPaintProperty("squares", "fill-opacity", fillOpacityExpr(baseStatus));
      map.setPaintProperty("streets", "line-color", colorExpr(baseStatus));
      map.setPaintProperty("streets", "line-width", widthExpr(LINE_WIDTH, baseStatus));
      map.setPaintProperty("streets-casing", "line-width", widthExpr(CASING_WIDTH, baseStatus));
    };
    if (map.getLayer("streets")) apply();
    else map.once("load", apply);
  }, [baseStatus, dark]);

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
    // isStyleLoaded() is false while tiles load (e.g. during a camera move); the source is enough.
    if (map.getSource("streets")) apply();
    else map.once("load", apply);
  }, [status, data, dark]);

  // Area changes: dimming outside the area (the pan limits stay the whole city).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("mask") as GeoJSONSource | undefined)?.setData(maskPolygon(outline ?? []));
    if (map.getLayer("mask"))
      map.setLayoutProperty("mask", "visibility", outline?.length ? "visible" : "none");
  }, [outline]);

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
      {(data.meta.aerial || (postcodeToggle && data.postcodes.length > 0)) && (
        <div
          className="pointer-events-none absolute right-3 flex flex-col items-end gap-2"
          style={{ top: padding.top + 8 }}
        >
          {data.meta.aerial && (
            <button
              onClick={() => updateSettings({ aerial: !settings.aerial })}
              disabled={!online}
              aria-pressed={showAerial}
              aria-label={showAerial ? "Karte anzeigen" : "Luftbild anzeigen"}
              title={online ? undefined : "Luftbild nur online verfügbar"}
              className={`glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full shadow-lg disabled:opacity-50 ${showAerial ? "text-brand" : ""}`}
            >
              {showAerial ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3l9 5-9 5-9-5 9-5z" />
                  <path d="M3 13l9 5 9-5" />
                </svg>
              )}
            </button>
          )}
          {showAerial && (
            <span className="glass rounded-full px-2 py-0.5 text-[10px] text-[var(--muted)]">
              Geobasis NRW
            </span>
          )}
          {postcodeToggle && data.postcodes.length > 0 && (
            <button
              onClick={() => updateSettings({ postcodes: !settings.postcodes })}
              aria-pressed={showPostcodes}
              aria-label={showPostcodes ? "PLZ-Gebiete ausblenden" : "PLZ-Gebiete anzeigen"}
              className={`glass pointer-events-auto grid h-11 w-11 place-items-center rounded-full text-[11px] font-bold shadow-lg ${showPostcodes ? "text-[#7c3aed]" : ""}`}
            >
              PLZ
            </button>
          )}
        </div>
      )}
    </div>
  );
}
