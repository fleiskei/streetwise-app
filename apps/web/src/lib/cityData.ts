import { useEffect, useState } from "react";
import {
  buildLevels,
  geometryBBox,
  type CityLevels,
  type CityMeta,
  type District,
  type Level,
  type PostcodeFeature,
  type StreetCollection,
  type StreetFeature,
} from "@streetwise/core";
import { unionBBox } from "./geo";

export const CITY = "aachen";
/** Id of the pseudo district "Ganz Aachen" that holds the city-wide levels. */
export const CITY_SCOPE = "ganze-stadt";

export interface CityData {
  meta: CityMeta;
  levels: CityLevels;
  streets: StreetCollection;
  names: string[];
  streetsById: Map<string, StreetFeature>;
  /** City-wide levels ("Ganz Aachen"), built in the app from all streets of the city. */
  city: District;
  levelById: Map<string, { level: Level; district: District }>;
  /** Vector tiles available (tools/tiles has been run)? Otherwise the streets act as the base map. */
  hasTiles: boolean;
  /** Postcode areas (E4); empty for data built before postcodes existed. */
  postcodes: PostcodeFeature[];
  postcodeByCode: Map<string, PostcodeFeature>;
}

export type CityDataState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; error: string }
  | { status: "ready"; data: CityData };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`${url}: HTTP ${res.status}`), { status: res.status });
  const type = res.headers.get("content-type") ?? "";
  // SPA fallbacks answer unknown paths with index.html; treat that as missing.
  if (type.includes("text/html"))
    throw Object.assign(new Error(`${url}: not found`), { status: 404 });
  return (await res.json()) as T;
}

/**
 * "Ganz Aachen": the same level logic as a district (main roads & squares first, compact groups
 * growing outwards from the centre), over all streets of the city. Progress is per street, so
 * it is shared with the district levels.
 */
export function buildCityScope(
  meta: CityMeta,
  levels: CityLevels,
  streets: StreetCollection,
): District {
  const byId = new Map(streets.features.map((f) => [f.properties.id, f]));
  const inLevels = new Set(levels.districts.flatMap((d) => d.levels.flatMap((l) => l.streetIds)));
  const items = streets.features
    .map((f) => f.properties)
    .filter((p) => inLevels.has(p.id))
    .map((p) => ({ id: p.id, kind: p.kind, center: p.center, importance: p.importance }));
  return {
    id: CITY_SCOPE,
    name: `Ganz ${meta.name}`,
    bounds: meta.bounds,
    outline: levels.districts.flatMap((d) => d.outline),
    levels: buildLevels(items, meta.center).map((streetIds, index) => ({
      id: `${CITY_SCOPE}-${index + 1}`,
      index,
      streetIds,
      bounds: unionBBox(streetIds.map((id) => geometryBBox(byId.get(id)!.geometry))),
    })),
  };
}

/** All level scopes: "Ganz Aachen" first, then the districts. */
export const scopes = (data: CityData): District[] => [data.city, ...data.levels.districts];

let cache: Promise<CityData> | null = null;

export function loadCity(city = CITY): Promise<CityData> {
  cache ??= (async () => {
    const base = `/data/${city}`;
    const [meta, levels, streets, names, hasTiles, postcodeData] = await Promise.all([
      getJson<CityMeta>(`${base}/meta.json`),
      getJson<CityLevels>(`${base}/levels.json`),
      getJson<StreetCollection>(`${base}/streets.geojson`),
      getJson<string[]>(`${base}/names.json`),
      getJson(`/tiles/${city}/tiles.json`).then(
        () => true,
        () => false,
      ),
      getJson<{ features: PostcodeFeature[] }>(`${base}/postcodes.geojson`).catch(() => ({
        features: [],
      })),
    ]);
    const postcodes = postcodeData.features;
    const postcodeByCode = new Map(postcodes.map((p) => [p.properties.code, p]));
    const streetsById = new Map(streets.features.map((f) => [f.properties.id, f]));
    const cityScope = buildCityScope(meta, levels, streets);
    const levelById = new Map<string, { level: Level; district: District }>();
    for (const district of [cityScope, ...levels.districts])
      for (const level of district.levels) levelById.set(level.id, { level, district });
    return {
      meta,
      levels,
      streets,
      names,
      streetsById,
      city: cityScope,
      levelById,
      hasTiles,
      postcodes,
      postcodeByCode,
    };
  })();
  cache.catch(() => (cache = null));
  return cache;
}

export function useCityData(): CityDataState {
  const [state, setState] = useState<CityDataState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadCity().then(
      (data) => alive && setState({ status: "ready", data }),
      (e: Error & { status?: number }) =>
        alive &&
        setState(e.status === 404 ? { status: "missing" } : { status: "error", error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
