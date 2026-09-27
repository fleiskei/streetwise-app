import type { CityMapDoc, StreetProgress } from "@streetwise/core";
import { fetchMe, type Me } from "./api";
import { CITY } from "./cityData";
import { applyServerCityMap, cityMapStore } from "./cityMap";
import { applyServerProgress, progressStore } from "./progress";
import { applyServerSettings, settingsStore, type Settings } from "./settings";
import { createStore, useStore } from "./store";

/**
 * Server sync (M4). Everything works offline and anonymously; once logged in, local changes
 * are pushed a few seconds after they happen, on app start, when coming back online and
 * when the app goes to the background.
 */
export interface SyncState {
  account: Me | { status: "unknown" };
  syncing: boolean;
  lastSync: number | null;
  error: string | null;
}

export const syncStore = createStore<SyncState>(
  "streetwise-sync-v1",
  { account: { status: "unknown" }, syncing: false, lastSync: null, error: null },
  (raw) => ({
    account: { status: "unknown" },
    syncing: false,
    lastSync: (raw as Partial<SyncState>).lastSync ?? null,
    error: null,
  }),
);
export const useSync = () => useStore(syncStore);

const patch = (p: Partial<SyncState>) => syncStore.set({ ...syncStore.get(), ...p });

const MAX_BATCH = 5000;
const DEBOUNCE_MS = 4000;

interface SyncResponse {
  progress: Record<string, StreetProgress>;
  cityMap: CityMapDoc;
  settings: { value: Partial<Settings>; updatedAt: number } | null;
  accepted: string[];
}

let dirty = true;
let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function syncNow(force = false): Promise<void> {
  const s = syncStore.get();
  if (s.syncing || s.account.status !== "loggedIn" || (!dirty && !force)) return;
  if (!navigator.onLine) return;
  patch({ syncing: true, error: null });
  try {
    const { updatedAt, ...value } = settingsStore.get();
    const body = {
      city: CITY,
      answers: progressStore.get().pending.slice(0, MAX_BATCH),
      cityMap: cityMapStore.get(),
      settings: updatedAt > 0 ? { value, updatedAt } : null,
    };
    dirty = false;
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      redirect: "manual",
    });
    if (res.type === "opaqueredirect" || res.status === 401) {
      dirty = true;
      patch({ syncing: false, account: { status: "loggedOut", reason: "session_expired" } });
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as SyncResponse;
    applying = true;
    try {
      applyServerProgress(data.progress, data.accepted);
      applyServerCityMap(data.cityMap);
      if (data.settings) applyServerSettings(data.settings.value, data.settings.updatedAt);
    } finally {
      applying = false;
    }
    patch({ syncing: false, lastSync: Date.now() });
    // More answers than one batch (first upload after a long offline time)?
    if (progressStore.get().pending.length > 0) {
      dirty = true;
      schedule(500);
    }
  } catch (e) {
    dirty = true;
    patch({ syncing: false, error: e instanceof Error ? e.message : String(e) });
  }
}

function schedule(ms = DEBOUNCE_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

const onLocalChange = () => {
  if (applying) return;
  dirty = true;
  schedule();
};

export async function refreshAccount() {
  const account = await fetchMe();
  patch({ account });
  if (account.status === "loggedIn") await syncNow(true);
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  progressStore.subscribe(onLocalChange);
  cityMapStore.subscribe(onLocalChange);
  settingsStore.subscribe(onLocalChange);
  window.addEventListener("online", () => void refreshAccount());
  // Push when the app goes to the background, pull when it comes back.
  document.addEventListener(
    "visibilitychange",
    () => void syncNow(document.visibilityState === "visible"),
  );
  void refreshAccount();
}
