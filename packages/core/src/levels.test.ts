import { describe, expect, it } from "vitest";
import { districtStatus, type District, type StreetProgress } from "./index";

const lvl = (id: string, n: number) => ({
  id,
  index: 0,
  bounds: [0, 0, 0, 0] as [number, number, number, number],
  streetIds: Array.from({ length: n }, (_, i) => `${id}-${i}`),
});
const district: District = {
  id: "d",
  name: "D",
  bounds: [0, 0, 0, 0],
  outline: [],
  levels: [lvl("l1", 5), lvl("l2", 5), lvl("l3", 5)],
};
const mastered: StreetProgress = { box: 3, dueAt: 0, nCorrect: 3, nWrong: 0, lastAt: 0 };
const seen: StreetProgress = { box: 1, dueAt: 0, nCorrect: 1, nWrong: 0, lastAt: 0 };

describe("districtStatus", () => {
  it("unlocks only the first level initially", () => {
    expect(districtStatus(district, {}).map((s) => s.unlocked)).toEqual([true, false, false]);
  });

  it("unlocks the next level at 80% mastered and awards stars", () => {
    const progress: Record<string, StreetProgress> = {
      "l1-0": mastered,
      "l1-1": mastered,
      "l1-2": mastered,
      "l1-3": mastered,
      "l1-4": seen,
    };
    const s = districtStatus(district, progress, new Set(["l1"]));
    expect(s.map((x) => x.unlocked)).toEqual([true, true, false]);
    expect(s[0]).toMatchObject({ mastered: 4, ratio: 0.8, stars: 3 });
    expect(s[1]!.stars).toBe(0);
  });
});
