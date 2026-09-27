import { describe, expect, it } from "vitest";
import {
  isPostcodeKey,
  pickPostcodeDistractors,
  postcodeKey,
  postcodeProgress,
  streetIdOfKey,
} from "./index";

describe("postcode keys", () => {
  it("round-trips and splits progress", () => {
    const k = postcodeKey("abc");
    expect(isPostcodeKey(k)).toBe(true);
    expect(streetIdOfKey(k)).toBe("abc");
    expect(streetIdOfKey("abc")).toBe("abc");
    const p = { box: 1, dueAt: 0, nCorrect: 1, nWrong: 0, lastAt: 0 };
    expect(postcodeProgress({ abc: p, [k]: { ...p, box: 3 } })).toEqual({ abc: { ...p, box: 3 } });
  });
});

describe("pickPostcodeDistractors", () => {
  const areas = [
    { code: "52062", label: [6.08, 50.77] as [number, number] },
    { code: "52064", label: [6.07, 50.77] as [number, number] },
    { code: "52066", label: [6.1, 50.76] as [number, number] },
    { code: "52070", label: [6.09, 50.79] as [number, number] },
    { code: "52076", label: [6.2, 50.7] as [number, number] },
    { code: "52080", label: [6.15, 50.8] as [number, number] },
  ];
  it("never offers a code the street lies in and prefers neighbours", () => {
    const out = pickPostcodeDistractors(["52062", "52064"], areas, [6.08, 50.77], 3, () => 0);
    expect(out).toHaveLength(3);
    expect(out).not.toContain("52062");
    expect(out).not.toContain("52064");
    // with one wrong answer only the three nearest areas are candidates
    for (let i = 0; i < 10; i++)
      expect(pickPostcodeDistractors(["52062"], areas, [6.08, 50.77], 1)).not.toContain("52076");
  });
});
