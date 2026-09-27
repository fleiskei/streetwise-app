import type { Mode } from "./types";

/** Review interval in days per (integer) box, see REQUIREMENTS F-10. */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35] as const;
export const MAX_BOX = INTERVAL_DAYS.length - 1;
export const MASTERED_BOX = 3;
/** How far a correct answer moves a street up, by mode (F-11). */
export const MODE_GAIN: Record<Mode, number> = { choice: 0.5, match: 1, locate: 1, complete: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StreetProgress {
  box: number;
  /** Epoch ms when the street is due again. */
  dueAt: number;
  nCorrect: number;
  nWrong: number;
  lastAt: number;
}

export interface Answer {
  streetId: string;
  mode: Mode;
  correct: boolean;
  /** Epoch ms. */
  at: number;
}

export function applyAnswer(
  prev: StreetProgress | undefined,
  answer: Pick<Answer, "mode" | "correct" | "at">,
): StreetProgress {
  const p = prev ?? { box: 0, dueAt: 0, nCorrect: 0, nWrong: 0, lastAt: 0 };
  const box = answer.correct
    ? Math.min(MAX_BOX, p.box + MODE_GAIN[answer.mode])
    : Math.min(p.box, 1);
  const interval = answer.correct ? INTERVAL_DAYS[Math.floor(box)]! : 0;
  return {
    box,
    dueAt: answer.at + interval * DAY_MS,
    nCorrect: p.nCorrect + (answer.correct ? 1 : 0),
    nWrong: p.nWrong + (answer.correct ? 0 : 1),
    lastAt: answer.at,
  };
}

/** Replays answers in chronological order; used by client and server so both agree. */
export function replay(
  answers: readonly Answer[],
  initial: Record<string, StreetProgress> = {},
): Record<string, StreetProgress> {
  const out = { ...initial };
  const sorted = [...answers].sort((a, b) => a.at - b.at);
  for (const a of sorted) out[a.streetId] = applyAnswer(out[a.streetId], a);
  return out;
}

export function isMastered(p: StreetProgress | undefined): boolean {
  return (p?.box ?? 0) >= MASTERED_BOX;
}

/** Seen streets that are due; unseen streets are introduced through levels, not reviews. */
export function isDue(p: StreetProgress | undefined, now: number): boolean {
  return p !== undefined && p.dueAt <= now;
}
