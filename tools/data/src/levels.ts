import type { LonLat, StreetKind } from "@streetwise/core";

export interface LevelInput {
  id: string;
  kind: StreetKind;
  center: LonLat;
  importance: number;
}

/** Tier order: main roads and squares first, then residential, then minor ways (F-13). */
const TIER: Record<StreetKind, number> = { major: 0, square: 0, minor: 1, path: 2 };

/**
 * Splits items into spatially compact groups of at most `maxSize` by recursively halving
 * along the wider axis. Deterministic, groups are between maxSize/2 and maxSize (if n ≥ maxSize/2).
 */
export function bisect<T extends { center: LonLat }>(items: T[], maxSize: number): T[][] {
  if (items.length <= maxSize) return items.length ? [items] : [];
  const xs = items.map((i) => i.center[0]);
  const ys = items.map((i) => i.center[1]);
  const lat = (Math.min(...ys) + Math.max(...ys)) / 2;
  const w = (Math.max(...xs) - Math.min(...xs)) * Math.cos((lat * Math.PI) / 180);
  const h = Math.max(...ys) - Math.min(...ys);
  const axis = w >= h ? 0 : 1;
  const sorted = [...items].sort((a, b) => a.center[axis] - b.center[axis]);
  const mid = Math.ceil(sorted.length / 2);
  return [...bisect(sorted.slice(0, mid), maxSize), ...bisect(sorted.slice(mid), maxSize)];
}

/**
 * Builds the level order for one district: per tier, compact groups of ≤ maxSize, groups
 * closest to `origin` first. A too-small last group of a tier is merged into its predecessor.
 */
export function buildLevels(
  items: LevelInput[],
  origin: LonLat,
  maxSize = 25,
  minSize = 8,
): string[][] {
  const levels: string[][] = [];
  for (const tier of [0, 1, 2]) {
    const tierItems = items.filter((i) => TIER[i.kind] === tier);
    const groups = bisect(tierItems, maxSize)
      .map((g) => {
        const c: LonLat = [
          g.reduce((s, i) => s + i.center[0], 0) / g.length,
          g.reduce((s, i) => s + i.center[1], 0) / g.length,
        ];
        return { g, d: (c[0] - origin[0]) ** 2 + (c[1] - origin[1]) ** 2 };
      })
      .sort((a, b) => a.d - b.d)
      .map(({ g }) => g.sort((a, b) => b.importance - a.importance).map((i) => i.id));
    for (const g of groups) {
      const prev = levels[levels.length - 1];
      if (g.length < minSize && prev && prev.length + g.length <= maxSize + minSize)
        prev.push(...g);
      else levels.push(g);
    }
  }
  return levels;
}
