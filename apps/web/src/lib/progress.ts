import { applyAnswer, type Answer, type Mode, type StreetProgress } from "@streetwise/core";
import { createStore, useStore } from "./store";

/**
 * Local learning state. `answers` is the event log that will be synced to the server (M4);
 * `streets` is the state derived from it with the shared Leitner logic.
 */
export interface ProgressState {
  streets: Record<string, StreetProgress>;
  answers: (Answer & { id: string })[];
}

export const progressStore = createStore<ProgressState>(
  "streetwise-progress-v1",
  { streets: {}, answers: [] },
  (raw) => {
    const r = raw as Partial<ProgressState>;
    return {
      streets: r.streets ?? {},
      answers: r.answers ?? [],
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
  const answers = [...s.answers];
  const at = Date.now();
  for (const it of items) {
    const answer = { ...it, at, id: uuid() };
    streets[it.streetId] = applyAnswer(streets[it.streetId], answer);
    answers.push(answer);
  }
  progressStore.set({ ...s, streets, answers });
}
