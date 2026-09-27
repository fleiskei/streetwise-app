import { describe, expect, it } from "vitest";
import {
  distanceToGeometry,
  haversine,
  hitTolerance,
  pickDistractors,
  type StreetProps,
} from "./index";

describe("geo", () => {
  it("haversine ~ 111 km per degree latitude", () => {
    expect(haversine([6, 50], [6, 51])).toBeCloseTo(111_195, -2);
  });

  it("distance to a line and inside a polygon", () => {
    const line = {
      type: "LineString" as const,
      coordinates: [
        [6.08, 50.775],
        [6.09, 50.775],
      ] as [number, number][],
    };
    // ~0.0001° lat ≈ 11 m north of the line
    expect(distanceToGeometry([6.085, 50.7751], line)).toBeCloseTo(11.1, 0);
    // beyond the end: distance to the end point
    expect(distanceToGeometry([6.0915, 50.775], line)).toBeGreaterThan(100);
    const square = {
      type: "Polygon" as const,
      coordinates: [
        [
          [6, 50],
          [6.001, 50],
          [6.001, 50.001],
          [6, 50.001],
          [6, 50],
        ],
      ] as [number, number][][],
    };
    expect(distanceToGeometry([6.0005, 50.0005], square)).toBe(0);
  });

  it("tolerance grows when zoomed out", () => {
    expect(hitTolerance(18, 50.77)).toBe(25);
    expect(hitTolerance(13, 50.77)).toBeGreaterThan(100);
  });
});

describe("pickDistractors", () => {
  const s = (
    id: string,
    name: string,
    lon: number,
    kind: StreetProps["kind"] = "minor",
  ): StreetProps => ({
    id,
    name,
    kind,
    district: "d",
    level: "l",
    importance: 1,
    center: [lon, 50],
    length: 100,
  });
  const target = s("t", "Markt", 6, "square");
  const pool = [
    s("a", "Markt", 6.0001, "square"),
    s("b", "Katschhof", 6.001, "square"),
    s("c", "Pontstraße", 6.002),
    s("d", "Hof", 6.003, "square"),
    s("e", "Fern", 7),
  ];

  it("never repeats the target name and prefers near streets of the same kind", () => {
    const out = pickDistractors(target, pool, 2, () => 0);
    expect(out.map((x) => x.name).sort()).toEqual(["Hof", "Katschhof"]);
  });
});
