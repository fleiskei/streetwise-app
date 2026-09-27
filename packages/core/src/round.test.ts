import { describe, expect, it } from "vitest";
import { chunkBoards, geometryBBox, pickRoundStreets, type StreetProgress } from "./index";

const p = (box: number, dueAt: number): StreetProgress => ({
  box,
  dueAt,
  nCorrect: 1,
  nWrong: 0,
  lastAt: 0,
});

describe("pickRoundStreets", () => {
  it("prefers unseen and due streets, then weak ones", () => {
    const progress = { a: p(5, 1e12), b: p(4, 1e12), c: p(1, 0), d: p(3, 1e12) };
    const ids = ["a", "b", "c", "d", "e"];
    const picked = pickRoundStreets(ids, progress, 3, 1000, () => 0.5);
    expect(picked.sort()).toEqual(["c", "d", "e"]);
  });

  it("returns all streets when fewer than count", () => {
    expect(pickRoundStreets(["x", "y"], {}, 10, 0)).toHaveLength(2);
  });
});

describe("chunkBoards", () => {
  it("merges a tiny last board", () => {
    expect(chunkBoards([1, 2, 3, 4, 5, 6, 7], 5).map((b) => b.length)).toEqual([7]);
    expect(chunkBoards([1, 2, 3, 4, 5, 6, 7, 8], 5).map((b) => b.length)).toEqual([5, 3]);
    expect(chunkBoards([], 5)).toEqual([]);
  });
});

describe("geometryBBox", () => {
  it("covers all coordinates", () => {
    expect(
      geometryBBox({
        type: "MultiLineString",
        coordinates: [
          [
            [1, 2],
            [3, 1],
          ],
          [
            [0, 5],
            [2, 2],
          ],
        ],
      }),
    ).toEqual([0, 1, 3, 5]);
  });
});
