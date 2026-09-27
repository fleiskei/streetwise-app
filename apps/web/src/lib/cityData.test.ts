import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CityLevels, CityMeta, StreetCollection } from "@streetwise/core";
import { buildCityScope, CITY_SCOPE } from "./cityData";

const read = <T>(f: string) =>
  JSON.parse(readFileSync(new URL(`../../public/data/aachen/${f}`, import.meta.url), "utf8")) as T;

describe("buildCityScope", () => {
  const meta = read<CityMeta>("meta.json");
  const levels = read<CityLevels>("levels.json");
  const streets = read<StreetCollection>("streets.geojson");
  const city = buildCityScope(meta, levels, streets);

  it("covers every district street exactly once", () => {
    const all = levels.districts.flatMap((d) => d.levels.flatMap((l) => l.streetIds)).sort();
    expect(city.levels.flatMap((l) => l.streetIds).sort()).toEqual(all);
  });

  it("numbers the levels and starts with main roads & squares", () => {
    expect(city.id).toBe(CITY_SCOPE);
    expect(city.name).toBe("Ganz Aachen");
    expect(city.levels.map((l) => l.index)).toEqual(city.levels.map((_, i) => i));
    expect(city.levels[0]!.id).toBe(`${CITY_SCOPE}-1`);
    const kinds = new Map(streets.features.map((f) => [f.properties.id, f.properties.kind]));
    expect(
      city.levels[0]!.streetIds.every((id) => ["major", "square"].includes(kinds.get(id)!)),
    ).toBe(true);
  });
});
