import { describe, expect, it } from "vitest";
import { buildNameIndex, suggest } from "./index";

const index = buildNameIndex([
  "Pontstraße",
  "Pontwall",
  "Kapuzinergraben",
  "Aachener Straße",
  "Adalbertstraße",
  "Adalbertsteinweg",
  "Pontstraße", // duplicate names appear in several districts
]);

describe("suggest", () => {
  it("respects minChars and 0 = off", () => {
    expect(suggest("po", index, { minChars: 3 })).toEqual([]);
    expect(suggest("pontstr", index, { minChars: 0 })).toEqual([]);
  });

  it("ranks whole-name prefix before word prefix before substring, deduplicated", () => {
    expect(suggest("pont", index, { minChars: 3 })).toEqual(["Pontwall", "Pontstraße"]);
    expect(suggest("strasse", index, { minChars: 3 })).toEqual([
      "Aachener Straße",
      "Pontstraße",
      "Adalbertstraße",
    ]);
  });

  it("limits results", () => {
    expect(suggest("a", index, { minChars: 1, limit: 2 })).toHaveLength(2);
  });
});
