import { districtStatus, type District, type Level } from "@streetwise/core";
import type { CityData } from "./cityData";
import type { CityMapState } from "./cityMap";
import type { ProgressState } from "./progress";

/** Ids of all unlocked levels (to detect level-ups after a round). */
export function unlockedLevelIds(data: CityData, progress: ProgressState): Set<string> {
  const out = new Set<string>();
  for (const d of data.levels.districts)
    districtStatus(d, progress.streets).forEach((s, i) => s.unlocked && out.add(d.levels[i]!.id));
  return out;
}

/** Label of a level unlocked since `before`, e.g. "Aachen-Mitte · Level 3", or null. */
export function newlyUnlocked(
  data: CityData,
  before: Set<string>,
  after: Set<string>,
): string | null {
  for (const id of after)
    if (!before.has(id)) {
      const e = data.levelById.get(id);
      if (e) return `${e.district.name} · Level ${e.level.index + 1}`;
    }
  return null;
}

/**
 * Where to continue learning: the first unlocked, not yet completed level of the district
 * played last (or the first district).
 */
export function continueLevel(
  data: CityData,
  progress: ProgressState,
): { level: Level; district: District } | null {
  const last = progress.answers[progress.answers.length - 1];
  const lastDistrict = last && data.streetsById.get(last.streetId)?.properties.district;
  const districts = [...data.levels.districts].sort(
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
  for (const d of data.levels.districts)
    for (const l of d.levels)
      if (
        l.streetIds.length &&
        l.streetIds.every((id) => cityMap.found[id] && !cityMap.found[id]!.hinted)
      )
        out.add(l.id);
  return out;
}
