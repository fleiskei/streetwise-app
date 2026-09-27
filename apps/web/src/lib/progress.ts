import type { StreetProgress } from "@streetwise/core";

// Local progress store. Filled by the quiz modes (M2/M3) and synced with the server (M4).
const KEY = "streetwise-progress-v1";

export function loadProgress(): Record<string, StreetProgress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, StreetProgress>;
  } catch {
    return {};
  }
}
