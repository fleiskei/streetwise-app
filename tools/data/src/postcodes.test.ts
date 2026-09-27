import { describe, expect, it } from "vitest";
import type { LonLat } from "@streetwise/core";
import { assignPostcodes, labelPoint, type PostcodeArea } from "./postcodes";

const sq = (x0: number, x1: number): LonLat[][][] => [
  [
    [
      [x0, 50],
      [x1, 50],
      [x1, 50.01],
      [x0, 50.01],
      [x0, 50],
    ],
  ],
];
const areas: PostcodeArea[] = [
  { code: "52062", polys: sq(6.0, 6.01) },
  { code: "52064", polys: sq(6.01, 6.02) },
];

describe("assignPostcodes", () => {
  it("orders by length share and drops tiny shares", () => {
    const street = {
      lines: [
        [
          [6.002, 50.005],
          [6.0115, 50.005],
        ] as LonLat[],
      ],
      polygons: [],
    };
    expect(assignPostcodes(street, areas)).toEqual(["52062", "52064"]);
    const barelyCrossing = {
      lines: [
        [
          [6.0, 50.005],
          [6.0102, 50.005],
        ] as LonLat[],
      ],
      polygons: [],
    };
    expect(assignPostcodes(barelyCrossing, areas)).toEqual(["52062"]);
  });

  it("returns nothing outside all areas", () => {
    expect(
      assignPostcodes(
        {
          lines: [
            [
              [7, 50],
              [7.001, 50],
            ] as LonLat[],
          ],
          polygons: [],
        },
        areas,
      ),
    ).toEqual([]);
  });
});

describe("labelPoint", () => {
  it("lies inside, near the middle of the polygon", () => {
    const [x, y] = labelPoint(sq(6.0, 6.01));
    expect(x).toBeCloseTo(6.005, 2);
    expect(y).toBeCloseTo(50.005, 2);
  });
});
