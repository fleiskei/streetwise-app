import { useSyncExternalStore } from "react";

export type Route =
  | { name: "home" }
  | { name: "district"; districtId: string }
  | { name: "explore"; levelId: string }
  | { name: "account" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "bezirk" && parts[1]) return { name: "district", districtId: parts[1] };
  if (parts[0] === "erkunden" && parts[1]) return { name: "explore", levelId: parts[1] };
  if (parts[0] === "konto") return { name: "account" };
  return { name: "home" };
}

export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "district":
      return `#/bezirk/${encodeURIComponent(route.districtId)}`;
    case "explore":
      return `#/erkunden/${encodeURIComponent(route.levelId)}`;
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
