import { describe, expect, it } from "vitest";
import type { LonLat } from "@streetwise/core";
import {
  assembleRings,
  relationPolygons,
  type OverpassElement,
  type OverpassRelation,
} from "./osm";
import { buildLevels, growGroups, type LevelInput } from "./levels";
import { simplifyLine } from "./simplify";
import { assignDistrict, mergePieces, piecesFromOverpass, streetId } from "./streets";

const g = (pts: LonLat[]) => pts.map(([lon, lat]) => ({ lon, lat }));

describe("assembleRings", () => {
  it("joins fragments in any direction into a closed ring", () => {
    const rings = assembleRings([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ], // reversed
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });

  it("assigns inner rings to their outer polygon", () => {
    const rel: OverpassRelation = {
      type: "relation",
      id: 1,
      members: [
        {
          type: "way",
          ref: 1,
          role: "outer",
          geometry: g([
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ]),
        },
        {
          type: "way",
          ref: 2,
          role: "inner",
          geometry: g([
            [4, 4],
            [6, 4],
            [6, 6],
            [4, 4],
          ]),
        },
      ],
    };
    const polys = relationPolygons(rel);
    expect(polys).toHaveLength(1);
    expect(polys[0]).toHaveLength(2);
  });
});

describe("streets", () => {
  const way = (id: number, tags: Record<string, string>, pts: LonLat[]): OverpassElement => ({
    type: "way",
    id,
    tags,
    geometry: g(pts),
  });

  it("merges same-named ways that are close, keeps distant namesakes separate", () => {
    const pieces = piecesFromOverpass([
      way(1, { highway: "residential", name: "Kirchstraße" }, [
        [6.0, 50.0],
        [6.001, 50.0],
      ]),
      way(2, { highway: "residential", name: "Kirchstraße" }, [
        [6.001, 50.0],
        [6.002, 50.0],
      ]),
      way(3, { highway: "residential", name: "Kirchstraße" }, [
        [6.2, 50.0],
        [6.201, 50.0],
      ]), // ~14 km away
      way(4, { highway: "footway", name: "Weg" }, [
        [6.0, 50.1],
        [6.001, 50.1],
      ]), // not a street
      way(5, { highway: "primary", name: "Kirchstr." }, [
        [6.002, 50.0],
        [6.003, 50.0],
      ]), // spelling variant
    ]);
    const merged = mergePieces(pieces);
    expect(merged).toHaveLength(2);
    const near = merged.find((m) => m.lines.length === 3)!;
    expect(near.kind).toBe("major");
    expect(near.name).toBe("Kirchstraße");
    expect(near.length).toBeGreaterThan(200);
  });

  it("square polygon absorbs same-named pedestrian lines", () => {
    const merged = mergePieces(
      piecesFromOverpass([
        way(1, { place: "square", name: "Markt" }, [
          [6, 50],
          [6.001, 50],
          [6.001, 50.001],
          [6, 50.001],
          [6, 50],
        ]),
        way(2, { highway: "pedestrian", name: "Markt" }, [
          [6.0002, 50.0005],
          [6.0008, 50.0005],
        ]),
      ]),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "square", lines: [] });
  });

  it("assigns the district with the largest share", () => {
    const left: LonLat[][][] = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    ];
    const right: LonLat[][][] = [
      [
        [
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [1, 0],
        ],
      ],
    ];
    const s = {
      lines: [
        [
          [0.9, 0.5],
          [1.5, 0.5],
        ] as LonLat[],
      ],
      polygons: [],
    };
    expect(assignDistrict(s, [left, right])).toBe(1);
  });

  it("ids are stable against small shifts and spelling variants", () => {
    expect(streetId("Pontstraße", [6.0801, 50.7801])).toBe(streetId("Pontstr.", [6.0802, 50.7802]));
    expect(streetId("Pontstraße", [6.08, 50.78])).not.toBe(streetId("Pontstraße", [6.1, 50.78]));
  });
});

describe("levels", () => {
  const items: LevelInput[] = Array.from({ length: 60 }, (_, i) => ({
    id: `s${i}`,
    kind: i < 12 ? "major" : i < 55 ? "minor" : "path",
    center: [6 + (i % 10) * 0.001, 50 + Math.floor(i / 10) * 0.001],
    importance: 100 - i,
  }));

  it("growGroups starts at the origin and keeps groups compact", () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({
      center: [6 + (i % 20) * 0.01, 50 + Math.floor(i / 20) * 0.01] as LonLat,
      i,
    }));
    const groups = growGroups(pts, [6, 50], 10);
    expect(groups.map((g) => g.length)).toEqual([10, 10, 10, 10]);
    expect(groups[0]!.map((p) => p.i)).toContain(0);
    // first group stays in the western quarter
    expect(Math.max(...groups[0]!.map((p) => p.center[0]))).toBeLessThan(6.06);
  });

  it("orders tiers, merges tiny trailing groups, covers every street once", () => {
    const levels = buildLevels(items, [6, 50]);
    expect(levels.flat().sort()).toEqual(items.map((i) => i.id).sort());
    expect(levels[0]).toContain("s0"); // majors first
    expect(levels.every((l) => l.length >= 8)).toBe(true);
    // the 5 paths are merged into the last residential level
    expect(levels[levels.length - 1]).toContain("s59");
  });
});

describe("simplifyLine", () => {
  it("removes collinear points and keeps corners", () => {
    const out = simplifyLine(
      [
        [6, 50],
        [6.0005, 50],
        [6.001, 50],
        [6.001, 50.001],
      ],
      2,
    );
    expect(out).toEqual([
      [6, 50],
      [6.001, 50],
      [6.001, 50.001],
    ]);
  });
});
