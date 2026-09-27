import { describe, expect, it } from "vitest";
import { href, parseRoute, type Route } from "./router";

describe("router", () => {
  it("round-trips routes", () => {
    const routes: Route[] = [
      { name: "home" },
      { name: "district", districtId: "aachen-mitte" },
      { name: "city", mode: "explore" },
      { name: "city", mode: "complete", focus: { kind: "level", id: "kornelimuenster-walheim-3" } },
      { name: "city", mode: "explore", focus: { kind: "district", id: "brand" } },
      { name: "level", levelId: "aachen-mitte-1" },
      { name: "play", levelId: "brand-2", mode: "choice" },
      { name: "review" },
      { name: "account" },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });

  it("maps level completion to the city map", () => {
    expect(parseRoute("#/spiel/brand-1/vervollstaendigen")).toEqual({
      name: "city",
      mode: "complete",
      focus: { kind: "level", id: "brand-1" },
    });
  });

  it("maps old explore links to the city map", () => {
    expect(parseRoute("#/erkunden/aachen-mitte-2")).toEqual({
      name: "city",
      mode: "explore",
      focus: { kind: "level", id: "aachen-mitte-2" },
    });
  });

  it("falls back to home", () => {
    expect(parseRoute("")).toEqual({ name: "home" });
    expect(parseRoute("#/unbekannt")).toEqual({ name: "home" });
    expect(parseRoute("#/spiel/x/quatsch")).toEqual({ name: "home" });
  });
});
