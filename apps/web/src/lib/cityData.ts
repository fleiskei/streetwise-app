import { useEffect, useState } from "react";
import type {
  CityLevels,
  CityMeta,
  District,
  Level,
  StreetCollection,
  StreetFeature,
} from "@streetwise/core";

export const CITY = "aachen";

export interface CityData {
  meta: CityMeta;
  levels: CityLevels;
  streets: StreetCollection;
  names: string[];
  streetsById: Map<string, StreetFeature>;
  levelById: Map<string, { level: Level; district: District }>;
  /** Vector tiles available (tools/tiles has been run)? Otherwise the streets act as the base map. */
  hasTiles: boolean;
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

let cache: Promise<CityData> | null = null;

export function loadCity(city = CITY): Promise<CityData> {
  cache ??= (async () => {
    const base = `/data/${city}`;
    const [meta, levels, streets, names, hasTiles] = await Promise.all([
      getJson<CityMeta>(`${base}/meta.json`),
      getJson<CityLevels>(`${base}/levels.json`),
      getJson<StreetCollection>(`${base}/streets.geojson`),
      getJson<string[]>(`${base}/names.json`),
      getJson(`/tiles/${city}/tiles.json`).then(
        () => true,
        () => false,
      ),
    ]);
    const streetsById = new Map(streets.features.map((f) => [f.properties.id, f]));
    const levelById = new Map<string, { level: Level; district: District }>();
    for (const district of levels.districts)
      for (const level of district.levels) levelById.set(level.id, { level, district });
    return { meta, levels, streets, names, streetsById, levelById, hasTiles };
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
