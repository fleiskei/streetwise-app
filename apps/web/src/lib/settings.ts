import { createStore, useStore } from "./store";

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** Autocomplete in "Karte vervollständigen" from this many characters; 0 = off. */
  autocompleteMinChars: 0 | 2 | 3 | 4;
}

export const settingsStore = createStore<Settings>("streetwise-settings-v1", {
  sound: true,
  haptics: true,
  autocompleteMinChars: 3,
});

export const useSettings = () => useStore(settingsStore);

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set({ ...settingsStore.get(), ...patch });
}
