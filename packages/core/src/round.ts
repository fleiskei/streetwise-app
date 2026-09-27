import { isDue, type StreetProgress } from "./leitner";
import { shuffle } from "./rng";

/** Streets per round in the question-by-question modes. */
export const ROUND_SIZE = 10;
/** Streets per board in the matching mode. */
export const MATCH_BOARD_SIZE = 5;

/**
 * Picks the streets for a round: unseen and due streets first, then the weakest ones
 * (lowest box); ties are broken randomly. The result is shuffled.
 */
export function pickRoundStreets(
  ids: readonly string[],
  progress: Record<string, StreetProgress>,
  count: number,
  now: number,
  rng: () => number = Math.random,
): string[] {
  const scored = ids.map((id) => {
    const p = progress[id];
    const urgent = !p || isDue(p, now);
    return { id, score: (urgent ? 0 : 10) + (p?.box ?? 0) + rng() * 0.9 };
  });
  scored.sort((a, b) => a.score - b.score);
  return shuffle(
    scored.slice(0, count).map((s) => s.id),
    rng,
  );
}

/** Splits streets into boards for the matching mode, avoiding a lonely last board. */
export function chunkBoards<T>(items: readonly T[], size = MATCH_BOARD_SIZE): T[][] {
  const boards: T[][] = [];
  for (let i = 0; i < items.length; i += size) boards.push(items.slice(i, i + size));
  const last = boards[boards.length - 1];
  const prev = boards[boards.length - 2];
  if (last && prev && last.length < 3) {
    prev.push(...last);
    boards.pop();
  }
  return boards;
}
