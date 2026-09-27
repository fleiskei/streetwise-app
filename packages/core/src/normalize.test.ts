import { describe, expect, it } from "vitest";
import { matchesName, normalizeName } from "./index";

describe("normalizeName", () => {
  it("ignores case, ß/ss, Str./Straße, hyphens and spaces", () => {
    const n = normalizeName("Kongressstraße");
    expect(normalizeName("kongressstrasse")).toBe(n);
    expect(normalizeName("Kongressstr.")).toBe(n);
    expect(normalizeName("Theaterplatz")).toBe(normalizeName("theater-platz"));
    expect(normalizeName("Aachener Str.")).toBe(normalizeName("aachener straße"));
  });

  it("treats umlauts and their ae/oe/ue spelling alike", () => {
    expect(normalizeName("Königstraße")).toBe(normalizeName("Koenigstrasse"));
    expect(normalizeName("Süsterfeldstraße")).toBe(normalizeName("Suesterfeldstrasse"));
  });

  it("expands St. to Sankt", () => {
    expect(normalizeName("St.-Vither-Straße")).toBe(normalizeName("Sankt-Vither-Straße"));
  });

  it("matchesName rejects empty answers", () => {
    expect(matchesName("", "Markt")).toBe(false);
    expect(matchesName(" markt ", "Markt")).toBe(true);
  });
});
