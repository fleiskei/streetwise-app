/**
 * Merge rules for data synced between devices (M4). Learning progress needs no merge
 * logic: answers are an append-only log and progress is `replay(answers)`.
 */

/** City map state as stored on each device and on the server. */
export interface CityMapDoc {
  /** Last reset (epoch ms); entries from before it are void. */
  resetAt: number | null;
  /** Found streets: when, and whether a hint had been used. */
  found: Record<string, { at: number; hinted: boolean }>;
  /** Hints for streets not found yet (street id → time of the hint). */
  hinted: Record<string, number>;
}

export const emptyCityMap = (): CityMapDoc => ({ resetAt: null, found: {}, hinted: {} });

/**
 * Symmetric merge of two city map states: the later reset wins, entries after it are
 * united (earliest find wins; a hint used on any device sticks).
 */
export function mergeCityMap(a: CityMapDoc, b: CityMapDoc): CityMapDoc {
  const resetAt =
    a.resetAt === null
      ? b.resetAt
      : b.resetAt === null
        ? a.resetAt
        : Math.max(a.resetAt, b.resetAt);
  const valid = (at: number) => resetAt === null || at >= resetAt;
  const found: CityMapDoc["found"] = {};
  for (const src of [a.found, b.found])
    for (const [id, f] of Object.entries(src)) {
      if (!valid(f.at)) continue;
      const prev = found[id];
      found[id] = prev
        ? { at: Math.min(prev.at, f.at), hinted: prev.hinted || f.hinted }
        : { ...f };
    }
  const hinted: CityMapDoc["hinted"] = {};
  for (const src of [a.hinted, b.hinted])
    for (const [id, at] of Object.entries(src)) {
      if (!valid(at)) continue;
      if (found[id]) {
        // A hint given before the street was found marks the find as hinted.
        if (at <= found[id]!.at) found[id]!.hinted = true;
        continue;
      }
      hinted[id] = Math.min(hinted[id] ?? at, at);
    }
  return { resetAt, found, hinted };
}

/** Settings are merged last-writer-wins. */
export interface Stamped<T> {
  value: T;
  updatedAt: number;
}

export function newer<T>(a: Stamped<T> | null, b: Stamped<T> | null): Stamped<T> | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}
