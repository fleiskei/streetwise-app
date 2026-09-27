import { useSyncExternalStore } from "react";

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

export function useDarkMode(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = query();
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => query().matches,
  );
}
