import { useSyncExternalStore } from "react";
import type { Mode } from "@streetwise/core";

export type Route =
  | { name: "home" }
  | { name: "district"; districtId: string }
  | { name: "level"; levelId: string }
  | { name: "explore"; levelId: string }
  | { name: "play"; levelId: string; mode: Mode }
  | { name: "account" };

/** German URL slugs for the quiz modes. */
export const MODE_SLUGS: Record<Mode, string> = {
  choice: "auswahl",
  match: "zuordnen",
  locate: "antippen",
  complete: "vervollstaendigen",
};
const SLUG_MODES = Object.fromEntries(Object.entries(MODE_SLUGS).map(([m, s]) => [s, m])) as Record<
  string,
  Mode
>;

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (a === "bezirk" && b) return { name: "district", districtId: b };
  if (a === "level" && b) return { name: "level", levelId: b };
  if (a === "erkunden" && b) return { name: "explore", levelId: b };
  if (a === "spiel" && b && c && SLUG_MODES[c])
    return { name: "play", levelId: b, mode: SLUG_MODES[c] };
  if (a === "konto") return { name: "account" };
  return { name: "home" };
}

export function href(route: Route): string {
  const e = encodeURIComponent;
  switch (route.name) {
    case "home":
      return "#/";
    case "district":
      return `#/bezirk/${e(route.districtId)}`;
    case "level":
      return `#/level/${e(route.levelId)}`;
    case "explore":
      return `#/erkunden/${e(route.levelId)}`;
    case "play":
      return `#/spiel/${e(route.levelId)}/${MODE_SLUGS[route.mode]}`;
    case "account":
      return "#/konto";
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
