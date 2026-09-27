import { describe, expect, it } from "vitest";
import { tileRange, tilesInBBox } from "./tiles";

describe("tiles", () => {
  it("computes the tile containing Aachen's Markt", () => {
    // 6.0839, 50.7762 at z14 -> x 8468, y 5501
    expect(tileRange([6.0839, 50.7762, 6.0839, 50.7762], 14)).toEqual({
      x0: 8468,
      x1: 8468,
      y0: 5501,
      y1: 5501,
    });
  });

  it("enumerates all zooms", () => {
    const tiles = [...tilesInBBox([6.0, 50.7, 6.2, 50.8], 0, 3)];
    expect(tiles.map((t) => t[0])).toEqual([0, 1, 2, 3]);
  });
});
