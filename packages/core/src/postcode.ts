import { haversine } from "./geo";
import { shuffle } from "./rng";
import type { LonLat, StreetProgress } from "./index";

/**
 * Postcode knowledge is tracked per street under its own key, next to the name knowledge
 * (F-28). The answer log and the sync stay unchanged.
 */
export const POSTCODE_PREFIX = "plz:";
export const postcodeKey = (streetId: string) => POSTCODE_PREFIX + streetId;
export const isPostcodeKey = (key: string) => key.startsWith(POSTCODE_PREFIX);
export const streetIdOfKey = (key: string) =>
  isPostcodeKey(key) ? key.slice(POSTCODE_PREFIX.length) : key;

/** Postcode progress of all streets, keyed by street id (for level bars and round selection). */
export function postcodeProgress(
  progress: Record<string, StreetProgress>,
): Record<string, StreetProgress> {
  const out: Record<string, StreetProgress> = {};
  for (const [key, p] of Object.entries(progress))
    if (isPostcodeKey(key)) out[key.slice(POSTCODE_PREFIX.length)] = p;
  return out;
}

/**
 * Wrong answers for "Straße → PLZ": codes the street does not lie in, preferably from nearby
 * areas (random among the closest few so rounds vary).
 */
export function pickPostcodeDistractors(
  correct: readonly string[],
  areas: readonly { code: string; label: LonLat }[],
  from: LonLat,
  count: number,
  rng: () => number = Math.random,
): string[] {
  const pool = areas
    .filter((a) => !correct.includes(a.code))
    .map((a) => ({ code: a.code, d: haversine(from, a.label) }))
    .sort((a, b) => a.d - b.d)
    .map((a) => a.code);
  const unique = [...new Set(pool)];
  return shuffle(unique.slice(0, count + 2), rng).slice(0, count);
}
