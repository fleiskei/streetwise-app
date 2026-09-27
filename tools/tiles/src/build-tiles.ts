/**
 * Extracts label-free vector tiles for a city from a Protomaps basemap build into
 *   apps/web/public/tiles/<city>/{z}/{x}/{y}.mvt
 * Usage: pnpm tiles:aachen [--source <url-or-path.pmtiles>] [--maxzoom 15]
 * Needs apps/web/public/data/<city>/meta.json (run the data pipeline first) for the bbox.
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { FetchSource, PMTiles, type RangeResponse, type Source } from "pmtiles";
import type { CityMeta } from "@streetwise/core";
import { expandBBox, tilesInBBox } from "./tiles";

const ROOT = path.join(import.meta.dirname, "..", "..", "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

class FileSource implements Source {
  constructor(private file: string) {}
  getKey() {
    return this.file;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const { open } = await import("node:fs/promises");
    const fh = await open(this.file);
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    } finally {
      await fh.close();
    }
  }
}

async function latestBuild(): Promise<string> {
  const res = await fetch("https://build-metadata.protomaps.dev/builds.json");
  if (!res.ok) throw new Error(`builds.json: HTTP ${res.status}`);
  const builds = (await res.json()) as { key: string }[];
  const key = builds
    .map((b) => b.key)
    .sort()
    .at(-1);
  if (!key) throw new Error("no protomaps builds listed");
  return `https://build.protomaps.com/${key}`;
}

async function main() {
  const city = process.argv[2];
  if (!city) throw new Error("usage: build-tiles <city>");
  const meta = JSON.parse(
    await readFile(path.join(ROOT, "apps/web/public/data", city, "meta.json"), "utf8"),
  ) as CityMeta;
  const source = arg("source") ?? (await latestBuild());
  const maxZoom = Number(arg("maxzoom") ?? 15);
  const archive = new PMTiles(
    /^https?:/.test(source) ? new FetchSource(source) : new FileSource(source),
  );
  const header = await archive.getHeader();
  console.log(`[${city}] source ${source} (z${header.minZoom}–${header.maxZoom})`);

  const outDir = path.join(ROOT, "apps/web/public/tiles", city);
  const bbox = expandBBox(meta.bounds, 0.01);
  const tiles = [...tilesInBBox(bbox, 0, Math.min(maxZoom, header.maxZoom))];
  let bytes = 0;
  let done = 0;
  const queue = [...tiles];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const [z, x, y] = t;
      const file = path.join(outDir, String(z), String(x), `${y}.mvt`);
      if (!process.argv.includes("--force") && (await stat(file).catch(() => null))) {
        done++;
        continue;
      }
      const res = await archive.getZxy(z, x, y);
      if (res) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, new Uint8Array(res.data));
        bytes += res.data.byteLength;
      }
      if (++done % 100 === 0)
        console.log(`  ${done}/${tiles.length} tiles, ${(bytes / 1e6).toFixed(1)} MB`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  await writeFile(
    path.join(outDir, "tiles.json"),
    JSON.stringify(
      { source, bbox, minzoom: 0, maxzoom: Math.min(maxZoom, header.maxZoom), count: tiles.length },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `[${city}] ${tiles.length} tiles, ${(bytes / 1e6).toFixed(1)} MB new → ${path.relative(ROOT, outDir)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
