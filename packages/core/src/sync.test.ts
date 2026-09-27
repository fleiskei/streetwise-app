import { describe, expect, it } from "vitest";
import { emptyCityMap, mergeCityMap, newer, type CityMapDoc } from "./index";

const doc = (d: Partial<CityMapDoc>): CityMapDoc => ({ ...emptyCityMap(), ...d });

describe("mergeCityMap", () => {
  it("unites finds, keeps the earliest time and sticky hint flags", () => {
    const a = doc({ found: { x: { at: 10, hinted: false }, y: { at: 5, hinted: true } } });
    const b = doc({ found: { x: { at: 7, hinted: false }, z: { at: 3, hinted: false } } });
    const m = mergeCityMap(a, b);
    expect(m.found).toEqual({
      x: { at: 7, hinted: false },
      y: { at: 5, hinted: true },
      z: { at: 3, hinted: false },
    });
    expect(mergeCityMap(b, a)).toEqual(m);
  });

  it("a later reset voids older entries from any device", () => {
    const phone = doc({ resetAt: 100, found: { a: { at: 120, hinted: false } } });
    const laptop = doc({
      found: { b: { at: 50, hinted: false }, c: { at: 150, hinted: false } },
      hinted: { d: 60, e: 160 },
    });
    const m = mergeCityMap(phone, laptop);
    expect(m.resetAt).toBe(100);
    expect(Object.keys(m.found).sort()).toEqual(["a", "c"]);
    expect(m.hinted).toEqual({ e: 160 });
  });

  it("a hint on another device marks a later find as hinted and disappears as pending hint", () => {
    const m = mergeCityMap(
      doc({ hinted: { a: 10 } }),
      doc({ found: { a: { at: 20, hinted: false } } }),
    );
    expect(m.found.a).toEqual({ at: 20, hinted: true });
    expect(m.hinted).toEqual({});
  });
});

describe("newer", () => {
  it("prefers the later update", () => {
    expect(newer({ value: 1, updatedAt: 1 }, { value: 2, updatedAt: 2 })!.value).toBe(2);
    expect(newer({ value: 1, updatedAt: 3 }, { value: 2, updatedAt: 2 })!.value).toBe(1);
    expect(newer(null, { value: 2, updatedAt: 2 })!.value).toBe(2);
  });
});
