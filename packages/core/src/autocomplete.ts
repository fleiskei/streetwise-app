import { normalizeName, normalizedWords } from "./normalize";

export interface NameIndexEntry {
  name: string;
  norm: string;
  words: string[];
}

export function buildNameIndex(names: readonly string[]): NameIndexEntry[] {
  const seen = new Set<string>();
  const out: NameIndexEntry[] = [];
  for (const name of names) {
    const norm = normalizeName(name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ name, norm, words: normalizedWords(name) });
  }
  return out;
}

export interface SuggestOptions {
  /** No suggestions below this many characters; 0 disables autocomplete. */
  minChars: number;
  limit?: number;
}

/**
 * Suggests names for the typed query. Ranking: prefix of the whole name, then prefix of a
 * later word, then substring; shorter names first within a rank.
 */
export function suggest(
  query: string,
  index: readonly NameIndexEntry[],
  opts: SuggestOptions,
): string[] {
  const q = normalizeName(query);
  if (opts.minChars <= 0 || q.length < opts.minChars) return [];
  const limit = opts.limit ?? 6;
  const scored: { entry: NameIndexEntry; rank: number }[] = [];
  for (const entry of index) {
    let rank = -1;
    if (entry.norm.startsWith(q)) rank = 0;
    else if (entry.words.some((w, i) => i > 0 && w.startsWith(q))) rank = 1;
    else if (entry.norm.includes(q)) rank = 2;
    if (rank >= 0) scored.push({ entry, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.entry.norm.length - b.entry.norm.length ||
      a.entry.name.localeCompare(b.entry.name, "de"),
  );
  return scored.slice(0, limit).map((s) => s.entry.name);
}

/** True if the typed answer means the given street name. */
export function matchesName(answer: string, name: string): boolean {
  const a = normalizeName(answer);
  return a.length > 0 && a === normalizeName(name);
}
