import { isMastered, type StreetProgress } from "./leitner";
import type { District, Level } from "./types";

/** Share of mastered streets needed to unlock the next level (F-14). */
export const UNLOCK_RATIO = 0.8;

export interface LevelStatus {
  total: number;
  mastered: number;
  /** Streets answered correctly at least once. */
  seenCorrect: number;
  ratio: number;
  unlocked: boolean;
  /** 0–3, see F-16. */
  stars: number;
}

export function levelStatus(
  level: Level,
  progress: Record<string, StreetProgress>,
  opts: { unlocked: boolean; perfectComplete: boolean },
): LevelStatus {
  const total = level.streetIds.length;
  let mastered = 0;
  let seenCorrect = 0;
  for (const id of level.streetIds) {
    const p = progress[id];
    if (isMastered(p)) mastered++;
    if ((p?.nCorrect ?? 0) > 0) seenCorrect++;
  }
  const ratio = total === 0 ? 1 : mastered / total;
  let stars = 0;
  if (total > 0 && seenCorrect === total) stars = 1;
  if (stars === 1 && ratio >= UNLOCK_RATIO) stars = 2;
  if (stars === 2 && opts.perfectComplete) stars = 3;
  return { total, mastered, seenCorrect, ratio, unlocked: opts.unlocked, stars };
}

/** Status of all levels of a district; level n+1 unlocks once level n reaches UNLOCK_RATIO. */
export function districtStatus(
  district: District,
  progress: Record<string, StreetProgress>,
  perfectLevels: ReadonlySet<string> = new Set(),
): LevelStatus[] {
  const out: LevelStatus[] = [];
  let unlocked = true;
  for (const level of district.levels) {
    const s = levelStatus(level, progress, {
      unlocked,
      perfectComplete: perfectLevels.has(level.id),
    });
    out.push(s);
    unlocked = unlocked && s.ratio >= UNLOCK_RATIO;
  }
  return out;
}
