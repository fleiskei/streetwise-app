import { districtStatus, type District, type Level } from "@streetwise/core";
import { CITY_SCOPE, scopes, type CityData } from "./cityData";
import type { CityMapState } from "./cityMap";
import type { ProgressState } from "./progress";
import { createStore } from "./store";

/** Level played last (local only), so "Weiterlernen" stays in "Ganz Aachen" or the district. */
export const lastLevelStore = createStore<{ id: string | null }>("streetwise-last-level-v1", {
  id: null,
});

/** Ids of all unlocked levels (to detect level-ups after a round). */
export function unlockedLevelIds(data: CityData, progress: ProgressState): Set<string> {
  const out = new Set<string>();
  for (const d of scopes(data))
    districtStatus(d, progress.streets).forEach((s, i) => s.unlocked && out.add(d.levels[i]!.id));
  return out;
}

/**
 * Label of a level unlocked since `before`, e.g. "Aachen-Mitte · Level 3", or null. Progress is
 * shared, so one round can unlock levels in several scopes: prefer `scope` (the one played),
 * then districts over "Ganz Aachen".
 */
export function newlyUnlocked(
  data: CityData,
  before: Set<string>,
  after: Set<string>,
  scope?: string,
): string | null {
  const fresh = [...after]
    .filter((id) => !before.has(id))
    .map((id) => data.levelById.get(id))
    .filter((e) => !!e);
  const rank = (d: { id: string }) => (d.id === scope ? 0 : d.id === CITY_SCOPE ? 2 : 1);
  const e = fresh.sort((a, b) => rank(a.district) - rank(b.district))[0];
  return e ? `${e.district.name} · Level ${e.level.index + 1}` : null;
}

/**
 * Where to continue learning: the first unlocked, not yet completed level of the scope played
 * last ("Ganz Aachen" or a district, else the district of the latest answer), then the others.
 */
export function continueLevel(
  data: CityData,
  progress: ProgressState,
): { level: Level; district: District } | null {
  const lastLevel = lastLevelStore.get().id;
  const lastDistrict =
    (lastLevel && data.levelById.get(lastLevel)?.district.id) ??
    (progress.lastStreetId
      ? data.streetsById.get(progress.lastStreetId)?.properties.district
      : undefined);
  const districts = [...data.levels.districts, data.city].sort(
    (a, b) => Number(b.id === lastDistrict) - Number(a.id === lastDistrict),
  );
  for (const district of districts) {
    const status = districtStatus(district, progress.streets);
    const i = status.findIndex((s) => s.unlocked && s.ratio < 0.8);
    if (i >= 0) return { level: district.levels[i]!, district };
  }
  return null;
}

/** Levels whose streets were all found in the city map without hints (third star, F-16). */
export function perfectLevelIds(data: CityData, cityMap: CityMapState): Set<string> {
  const out = new Set<string>();
  for (const d of scopes(data))
    for (const l of d.levels)
      if (
        l.streetIds.length &&
        l.streetIds.every((id) => cityMap.found[id] && !cityMap.found[id]!.hinted)
      )
        out.add(l.id);
  return out;
}
