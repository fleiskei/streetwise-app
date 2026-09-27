import { createStore, useStore } from "./store";

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Autocomplete in "Karte vervollständigen" from this many characters; 0 = off. */
  autocompleteMinChars: 0 | 2 | 3 | 4;
  /** Show aerial imagery instead of the drawn base map (online only). */
  aerial: boolean;
  /** Show postcode areas on the city map (E4.5). */
  postcodes: boolean;
  /** Last local change (epoch ms), for last-writer-wins sync. */
  updatedAt: number;
}

export const settingsStore = createStore<Settings>("streetwise-settings-v1", {
  sound: true,
  haptics: true,
  autocompleteMinChars: 3,
  aerial: false,
  postcodes: false,
  updatedAt: 0,
});

export const useSettings = () => useStore(settingsStore);

export function updateSettings(patch: Partial<Omit<Settings, "updatedAt">>) {
  settingsStore.set({ ...settingsStore.get(), ...patch, updatedAt: Date.now() });
}

/** Applies settings from the server without marking them as a local change. */
export function applyServerSettings(value: Partial<Settings>, updatedAt: number) {
  if (updatedAt <= settingsStore.get().updatedAt) return;
  settingsStore.set({ ...settingsStore.get(), ...value, updatedAt });
}
