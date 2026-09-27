import type { LonLat, StreetKind } from "@streetwise/core";

export interface LevelInput {
  id: string;
  kind: StreetKind;
  center: LonLat;
  importance: number;
}

/** Tier order: main roads and squares first, then residential, then minor ways (F-13). */
const TIER: Record<StreetKind, number> = { major: 0, square: 0, minor: 1, path: 2 };

const dist2 = (a: LonLat, b: LonLat) => {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return ((a[0] - b[0]) * k) ** 2 + (a[1] - b[1]) ** 2;
};

/**
 * Greedy compact grouping: seed = remaining item closest to `origin`, group = seed plus its
 * nearest remaining neighbours. Levels therefore grow outwards from the centre and each one
 * covers a small neighbourhood.
 */
export function growGroups<T extends { center: LonLat }>(
  items: T[],
  origin: LonLat,
  size: number,
): T[][] {
  const remaining = [...items];
  const groups: T[][] = [];
  while (remaining.length) {
    let seedIdx = 0;
    for (let i = 1; i < remaining.length; i++)
      if (dist2(remaining[i]!.center, origin) < dist2(remaining[seedIdx]!.center, origin))
        seedIdx = i;
    const seed = remaining[seedIdx]!;
    remaining.sort((a, b) => dist2(a.center, seed.center) - dist2(b.center, seed.center));
    groups.push(remaining.splice(0, size));
  }
  return groups;
}

/**
 * Builds the level order for one district: per tier (main roads & squares, residential, minor
 * ways) compact groups of `size` streets growing outwards from `origin`. A too-small trailing
 * group is merged into its predecessor.
 */
export function buildLevels(
  items: LevelInput[],
  origin: LonLat,
  size = 20,
  minSize = 8,
): string[][] {
  const levels: string[][] = [];
  for (const tier of [0, 1, 2]) {
    const groups = growGroups(
      items.filter((i) => TIER[i.kind] === tier),
      origin,
      size,
    ).map((g) => g.sort((a, b) => b.importance - a.importance).map((i) => i.id));
    for (const g of groups) {
      const prev = levels[levels.length - 1];
      if (g.length < minSize && prev && prev.length + g.length <= size + minSize) prev.push(...g);
      else levels.push(g);
    }
  }
  return levels;
}
