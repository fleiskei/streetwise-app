import { createStore, useStore } from "./store";

/**
 * State of the city map ("Karte vervollständigen" without levels, REQUIREMENTS F-24). Kept
 * until the user resets it; synced to the server in M4.
 */
export interface CityMapState {
  /** Streets entered, with time and whether a hint was used for them. */
  found: Record<string, { at: number; hinted: boolean }>;
  /** Streets revealed by a hint but not entered yet. */
  hinted: string[];
}

export const cityMapStore = createStore<CityMapState>(
  "streetwise-citymap-v1",
  { found: {}, hinted: [] },
  (raw) => {
    const r = raw as Partial<CityMapState>;
    return { found: r.found ?? {}, hinted: r.hinted ?? [] };
  },
);

export const useCityMap = () => useStore(cityMapStore);

/** Marks streets as found; returns those that count for learning progress (entered without hint). */
export function addFound(ids: string[]): string[] {
  const s = cityMapStore.get();
  const found = { ...s.found };
  const counted: string[] = [];
  const at = Date.now();
  for (const id of ids) {
    if (found[id]) continue;
    const hinted = s.hinted.includes(id);
    found[id] = { at, hinted };
    if (!hinted) counted.push(id);
  }
  cityMapStore.set({ found, hinted: s.hinted.filter((id) => !found[id]) });
  return counted;
}

export function addHint(id: string) {
  const s = cityMapStore.get();
  if (!s.hinted.includes(id)) cityMapStore.set({ ...s, hinted: [...s.hinted, id] });
}

export function resetCityMap() {
  cityMapStore.set({ found: {}, hinted: [] });
}
