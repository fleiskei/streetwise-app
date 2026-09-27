import { applyAnswer, replay, type Answer, type Mode, type StreetProgress } from "@streetwise/core";
import { createStore, useStore } from "./store";

export type PendingAnswer = Answer & { id: string };

/**
 * Local learning state. `streets` is derived with the shared Leitner logic; `pending` holds
 * answers not yet uploaded (M4 sync). Anonymous users simply keep everything pending.
 */
export interface ProgressState {
  streets: Record<string, StreetProgress>;
  pending: PendingAnswer[];
  /** Street of the latest answer (for "Weiterlernen"). */
  lastStreetId: string | null;
}

export const progressStore = createStore<ProgressState>(
  "streetwise-progress-v1",
  { streets: {}, pending: [], lastStreetId: null },
  (raw) => {
    const r = raw as Partial<ProgressState> & { answers?: PendingAnswer[] };
    // v1 kept the whole answer log in `answers`; none of it has been uploaded yet.
    const pending = r.pending ?? r.answers ?? [];
    return {
      streets: r.streets ?? {},
      pending,
      lastStreetId: r.lastStreetId ?? pending[pending.length - 1]?.streetId ?? null,
    };
  },
);

export const useProgress = () => useStore(progressStore);
export const loadProgress = () => progressStore.get().streets;

const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function recordAnswers(items: { streetId: string; mode: Mode; correct: boolean }[]) {
  if (!items.length) return;
  const s = progressStore.get();
  const streets = { ...s.streets };
  const pending = [...s.pending];
  const at = Date.now();
  for (const it of items) {
    const answer = { ...it, at, id: uuid() };
    streets[it.streetId] = applyAnswer(streets[it.streetId], answer);
    pending.push(answer);
  }
  progressStore.set({ streets, pending, lastStreetId: items[items.length - 1]!.streetId });
}

/**
 * Applies the server's progress after a sync: uploaded answers leave the queue, answers
 * recorded meanwhile are replayed on top of the server state.
 */
export function applyServerProgress(server: Record<string, StreetProgress>, acceptedIds: string[]) {
  const s = progressStore.get();
  const accepted = new Set(acceptedIds);
  const pending = s.pending.filter((a) => !accepted.has(a.id));
  progressStore.set({ ...s, streets: replay(pending, server), pending });
}
