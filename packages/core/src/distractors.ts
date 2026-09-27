import { haversine } from "./geo";
import { normalizeName } from "./normalize";
import { shuffle } from "./rng";
import type { StreetProps } from "./types";

/**
 * Picks wrong answers for multiple choice: preferably nearby streets of the same kind, never a
 * street with the same (normalised) name as the target or as another option.
 */
export function pickDistractors(
  target: StreetProps,
  candidates: readonly StreetProps[],
  count: number,
  rng: () => number = Math.random,
): StreetProps[] {
  const used = new Set([normalizeName(target.name)]);
  const pool = candidates
    .filter((c) => c.id !== target.id)
    .map((c) => ({
      c,
      d: haversine(target.center, c.center) + (c.kind === target.kind ? 0 : 1500),
    }))
    .sort((a, b) => a.d - b.d);
  // Choose randomly among the closest few so rounds do not always look the same.
  const near = shuffle(pool.slice(0, count * 4), rng).concat(pool.slice(count * 4));
  const out: StreetProps[] = [];
  for (const { c } of near) {
    const n = normalizeName(c.name);
    if (used.has(n)) continue;
    used.add(n);
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}
