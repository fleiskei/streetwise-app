import { createStore, useStore } from "./store";

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Autocomplete in "Karte vervollständigen" from this many characters; 0 = off. */
  autocompleteMinChars: 0 | 2 | 3 | 4;
  /** Show aerial imagery instead of the drawn base map (online only). */
  aerial: boolean;
}

export const settingsStore = createStore<Settings>("streetwise-settings-v1", {
  sound: true,
  haptics: true,
  autocompleteMinChars: 3,
  aerial: false,
});

export const useSettings = () => useStore(settingsStore);

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set({ ...settingsStore.get(), ...patch });
}
