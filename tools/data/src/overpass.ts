import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OverpassResponse } from "./osm";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/** Public Overpass servers are often busy (429/504); retry all endpoints a few times. */
const ROUNDS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CACHE_DIR = path.join(import.meta.dirname, "..", ".cache");

/** Runs an Overpass query; responses are cached in tools/data/.cache (delete to refresh). */
export async function overpass(query: string, { useCache = true } = {}): Promise<OverpassResponse> {
  const key = createHash("sha1").update(query).digest("hex").slice(0, 16);
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (useCache) {
    try {
      return JSON.parse(await readFile(file, "utf8")) as OverpassResponse;
    } catch {
      /* not cached */
    }
  }
  let lastError: unknown;
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) {
      const wait = 30_000 * round;
      console.warn(`all Overpass endpoints failed, retrying in ${wait / 1000} s …`);
      await sleep(wait);
    }
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": "streetwise-data/1.0",
          },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok)
          throw new Error(
            `${url}: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`,
          );
        const text = await res.text();
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(file, text);
        return JSON.parse(text) as OverpassResponse;
      } catch (e) {
        lastError = e;
        console.warn(`Overpass request failed: ${String(e).slice(0, 120)}`);
      }
    }
  }
  throw lastError;
}
