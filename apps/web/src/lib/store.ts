import { useSyncExternalStore } from "react";

/** Tiny localStorage-backed store with React subscription; tolerant to unavailable storage. */
export function createStore<T>(
  key: string,
  initial: T,
  migrate: (raw: unknown) => T = (r) => ({ ...initial, ...(r as object) }) as T,
) {
  let value: T = initial;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = migrate(JSON.parse(raw));
  } catch {
    /* unavailable or corrupt — start fresh */
  }
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or disabled — keep in memory */
      }
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
