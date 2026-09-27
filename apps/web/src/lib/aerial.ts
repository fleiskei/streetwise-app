import { addProtocol } from "maplibre-gl";
import type { AerialSource } from "@streetwise/core";

/**
 * MapLibre only knows {z}/{x}/{y}; WMTS services like Geobasis NRW name their zoom levels
 * differently ("00" = zoom 5). A custom protocol translates `aerial://z/x/y` to the real URL.
 */
let registered: string | null = null;

export function registerAerial(src: AerialSource) {
  if (registered === src.tiles) return;
  registered = src.tiles;
  addProtocol("aerial", async (params, abort) => {
    const [z, x, y] = params.url.replace("aerial://", "").split("/").map(Number) as [
      number,
      number,
      number,
    ];
    const url = src.tiles
      .replace("{m}", String(z - src.matrixOffset).padStart(2, "0"))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) throw new Error(`aerial tile ${res.status}`);
    return { data: await res.arrayBuffer() };
  });
}
