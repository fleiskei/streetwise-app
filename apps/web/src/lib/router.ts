import { useSyncExternalStore } from "react";
import type { Mode } from "@streetwise/core";

export type Route =
  | { name: "home" }
  | { name: "district"; districtId: string }
  | { name: "level"; levelId: string }
  | { name: "city"; mode: CityMode; focus?: CityFocus }
  | { name: "play"; levelId: string; mode: LevelMode }
  | { name: "review" }
  | { name: "account" };

export type CityMode = "explore" | "complete";
/** Modes played within a level; "complete" lives on the city map. */
export type LevelMode = Exclude<Mode, "complete">;
export type CityFocus = { kind: "level" | "district"; id: string };
const CITY_SLUGS: Record<CityMode, string> = { explore: "erkunden", complete: "vervollstaendigen" };

/** German URL slugs for the quiz modes. */
export const MODE_SLUGS: Record<Mode, string> = {
  choice: "auswahl",
  match: "zuordnen",
  locate: "antippen",
  complete: "vervollstaendigen",
};
const SLUG_MODES = Object.fromEntries(
  Object.entries(MODE_SLUGS)
    .filter(([m]) => m !== "complete")
    .map(([m, s]) => [s, m]),
) as Record<string, LevelMode>;

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === "stadtkarte") {
    const mode: CityMode = b === CITY_SLUGS.complete ? "complete" : "explore";
    const kind = c === "level" ? "level" : c === "bezirk" ? "district" : null;
    return kind && d ? { name: "city", mode, focus: { kind, id: d } } : { name: "city", mode };
  }
  if (a === "bezirk" && b) return { name: "district", districtId: b };
  if (a === "level" && b) return { name: "level", levelId: b };
  // Old links: explore a level → city map focused on that level.
  if (a === "erkunden" && b)
    return { name: "city", mode: "explore", focus: { kind: "level", id: b } };
  // "Karte vervollständigen" runs on the city map (F-24), focused on the level.
  if (a === "spiel" && b && c === MODE_SLUGS.complete)
    return { name: "city", mode: "complete", focus: { kind: "level", id: b } };
  if (a === "spiel" && b && c && SLUG_MODES[c])
    return { name: "play", levelId: b, mode: SLUG_MODES[c] };
  if (a === "wiederholen") return { name: "review" };
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
    case "city": {
      const base = `#/stadtkarte/${CITY_SLUGS[route.mode]}`;
      if (!route.focus) return base;
      return `${base}/${route.focus.kind === "level" ? "level" : "bezirk"}/${e(route.focus.id)}`;
    }
    case "play":
      return `#/spiel/${e(route.levelId)}/${MODE_SLUGS[route.mode]}`;
    case "review":
      return "#/wiederholen";
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
