import { mergeCityMap, type CityMapDoc } from "@streetwise/core";
import { createStore, useStore } from "./store";

/**
 * State of the city map ("Karte vervollständigen" without levels, REQUIREMENTS F-24). Kept
 * until the user resets it; merged with the server (M4) via mergeCityMap.
 */
export type CityMapState = CityMapDoc;

export const cityMapStore = createStore<CityMapState>(
  "streetwise-citymap-v1",
  { resetAt: null, found: {}, hinted: {} },
  (raw) => {
    const r = raw as Partial<CityMapState> & { hinted?: string[] | Record<string, number> };
    // Earlier versions stored hints as a list of ids.
    const hinted = Array.isArray(r.hinted)
      ? Object.fromEntries(r.hinted.map((id) => [id, Date.now()]))
      : (r.hinted ?? {});
    return { resetAt: r.resetAt ?? null, found: r.found ?? {}, hinted };
  },
);

export const useCityMap = () => useStore(cityMapStore);

/** Marks streets as found; returns those that count for learning progress (entered without hint). */
export function addFound(ids: string[]): string[] {
  const s = cityMapStore.get();
  const found = { ...s.found };
  const hinted = { ...s.hinted };
  const counted: string[] = [];
  const at = Date.now();
  for (const id of ids) {
    if (found[id]) continue;
    const wasHinted = id in hinted;
    found[id] = { at, hinted: wasHinted };
    delete hinted[id];
    if (!wasHinted) counted.push(id);
  }
  cityMapStore.set({ ...s, found, hinted });
  return counted;
}

export function addHint(id: string) {
  const s = cityMapStore.get();
  if (!(id in s.hinted) && !s.found[id])
    cityMapStore.set({ ...s, hinted: { ...s.hinted, [id]: Date.now() } });
}

export function resetCityMap() {
  cityMapStore.set({ resetAt: Date.now(), found: {}, hinted: {} });
}

/** Merges the server's city map into the local one (local changes made meanwhile survive). */
export function applyServerCityMap(server: CityMapState) {
  cityMapStore.set(mergeCityMap(cityMapStore.get(), server));
}
