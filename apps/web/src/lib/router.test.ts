import { describe, expect, it } from "vitest";
import { href, parseRoute, type Route } from "./router";

describe("router", () => {
  it("round-trips routes", () => {
    const routes: Route[] = [
      { name: "home" },
      { name: "district", districtId: "aachen-mitte" },
      { name: "explore", levelId: "kornelimuenster-walheim-3" },
      { name: "level", levelId: "aachen-mitte-1" },
      { name: "play", levelId: "aachen-mitte-1", mode: "complete" },
      { name: "play", levelId: "brand-2", mode: "choice" },
      { name: "account" },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });

  it("falls back to home", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/unbekannt")).toEqual({ name: "home" });
    expect(parseRoute("#/spiel/x/quatsch")).toEqual({ name: "home" });
  });
});
