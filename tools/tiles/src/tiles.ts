import type { BBox } from "@streetwise/core";

/** Slippy-map tile range covering a bbox at zoom z. */
export function tileRange(
  bbox: BBox,
  z: number,
): { x0: number; x1: number; y0: number; y1: number } {
  const n = 2 ** z;
  const x = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const y = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const [w, s, e, nn] = bbox;
  return { x0: x(w), x1: x(e), y0: y(nn), y1: y(s) };
}

export function* tilesInBBox(
  bbox: BBox,
  minZoom: number,
  maxZoom: number,
): Generator<[number, number, number]> {
  for (let z = minZoom; z <= maxZoom; z++) {
    const { x0, x1, y0, y1 } = tileRange(bbox, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield [z, x, y];
  }
}

export function expandBBox([w, s, e, n]: BBox, marginDeg: number): BBox {
  return [w - marginDeg, s - marginDeg, e + marginDeg, n + marginDeg];
}
