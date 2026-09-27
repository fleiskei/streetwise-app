/**
 * Builds the static city data used by the app from OpenStreetMap (Overpass):
 *   apps/web/public/data/<city>/{meta.json, levels.json, streets.geojson, names.json}
 * Usage: pnpm data:aachen   (or: pnpm --filter @streetwise/data build-city <city>)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DATA_FORMAT_VERSION,
  pointInPolygon,
  type AerialSource,
  type BBox,
  type CityLevels,
  type CityMeta,
  type PostcodeCollection,
  type District,
  type LonLat,
  type StreetCollection,
  type StreetFeature,
} from "@streetwise/core";
import { overpass } from "./overpass";
import { relationPolygons, type OverpassRelation } from "./osm";
import { buildLevels } from "./levels";
import { assignPostcodes, labelPoint, type PostcodeArea } from "./postcodes";
import { roundCoords, simplifyLine } from "./simplify";
import {
  assignDistrict,
  HIGHWAY_REGEX,
  importance,
  mergePieces,
  piecesFromOverpass,
  streetCenter,
  streetId,
} from "./streets";

interface CityConfig {
  id: string;
  name: string;
  osm: { cityArea: string; districtAdminLevel: number };
  expectedDistricts: string[];
  center: LonLat;
  aerial?: AerialSource;
}

const ROOT = path.join(import.meta.dirname, "..", "..", "..");
/** A city build with fewer streets than this is certainly broken. */
const MIN_STREETS = 100;

function bboxOf(points: LonLat[]): BBox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  return [w, s, e, n].map((v) => Math.round(v * 1e5) / 1e5) as BBox;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const cityId = process.argv[2];
  if (!cityId) throw new Error("usage: build-city <city>");
  const config = JSON.parse(
    await readFile(path.join(ROOT, "cities", `${cityId}.json`), "utf8"),
  ) as CityConfig;
  const useCache = !process.argv.includes("--refresh");

  console.log(`[${cityId}] loading boundaries …`);
  const areaDef = `area${config.osm.cityArea}->.city;`;
  const boundaries = await overpass(
    `[out:json][timeout:300];${areaDef}(relation${config.osm.cityArea};relation(area.city)["boundary"="administrative"]["admin_level"="${config.osm.districtAdminLevel}"];);out geom;`,
    { useCache },
  );
  const rels = boundaries.elements.filter((e): e is OverpassRelation => e.type === "relation");
  const cityRel = rels.find((r) => r.tags?.admin_level === "8");
  if (!cityRel) throw new Error("city boundary not found");
  const cityPolys = relationPolygons(cityRel);
  let districtRels = rels
    .filter((r) => r.tags?.admin_level === String(config.osm.districtAdminLevel))
    .map((r) => ({ name: r.tags?.name ?? String(r.id), polys: relationPolygons(r) }))
    .filter((d) => d.polys.length);
  // Relations only touching the city (neighbours) have their centre outside it.
  districtRels = districtRels.filter((d) => {
    const c = streetCenter({ lines: [], polygons: d.polys });
    return cityPolys.some((p) => pointInPolygon(c, p));
  });
  if (!districtRels.length) {
    console.warn("no districts found, using the whole city as one district");
    districtRels = [{ name: config.name, polys: cityPolys }];
  }
  const missing = config.expectedDistricts.filter((n) => !districtRels.some((d) => d.name === n));
  if (missing.length)
    console.warn(
      `expected districts not found: ${missing.join(", ")} (found: ${districtRels.map((d) => d.name).join(", ")})`,
    );

  console.log(`[${cityId}] loading streets …`);
  const streetsRes = await overpass(
    `[out:json][timeout:300];${areaDef}(way(area.city)["highway"~"${HIGHWAY_REGEX}"]["name"];way(area.city)["place"="square"]["name"];relation(area.city)["place"="square"]["name"];);out geom;`,
    { useCache },
  );

  console.log(`[${cityId}] loading postcode areas …`);
  const postcodeRes = await overpass(
    `[out:json][timeout:300];${areaDef}relation(area.city)["boundary"="postal_code"];out geom;`,
    { useCache },
  );
  const postcodeAreas: PostcodeArea[] = postcodeRes.elements
    .filter((e): e is OverpassRelation => e.type === "relation" && !!e.tags?.postal_code)
    .map((r) => ({ code: r.tags!.postal_code!, polys: relationPolygons(r) }))
    // only areas that overlap the city (relation(area) also returns neighbours touching it)
    .filter(
      (a) =>
        a.polys.length &&
        a.polys.some((poly) =>
          cityPolys.some((cp) => poly[0]!.some((pt) => pointInPolygon(pt, cp))),
        ),
    );

  const merged = mergePieces(piecesFromOverpass(streetsRes.elements));
  const districtPolys = districtRels.map((d) => d.polys);
  const features: StreetFeature[] = [];
  const ids = new Set<string>();
  const perDistrict = districtRels.map(() => [] as StreetFeature[]);
  let dropped = 0;
  for (const s of merged) {
    const di = assignDistrict(s, districtPolys);
    if (di < 0 || (s.kind !== "square" && s.length < 20)) {
      dropped++;
      continue;
    }
    const center = streetCenter(s);
    let id = streetId(s.name, center);
    for (let n = 2; ids.has(id); n++) id = `${streetId(s.name, center)}-${n}`;
    ids.add(id);
    const lines = s.lines.map((l) => roundCoords(simplifyLine(l, 2)));
    const polys = s.polygons.map((p) => p.map((r) => roundCoords(simplifyLine(r, 1))));
    const geometry: StreetFeature["geometry"] = polys.length
      ? polys.length === 1
        ? { type: "Polygon", coordinates: polys[0]! }
        : { type: "MultiPolygon", coordinates: polys }
      : lines.length === 1
        ? { type: "LineString", coordinates: lines[0]! }
        : { type: "MultiLineString", coordinates: lines };
    const f: StreetFeature = {
      type: "Feature",
      properties: {
        id,
        name: s.name,
        kind: s.kind,
        district: slug(districtRels[di]!.name),
        level: "",
        importance: importance(s),
        center: roundCoords([center])[0]!,
        length: Math.round(s.length),
        postcodes: assignPostcodes(s, postcodeAreas),
      },
      geometry,
    };
    features.push(f);
    perDistrict[di]!.push(f);
  }

  const districts: District[] = districtRels.map((d, i) => {
    const id = slug(d.name);
    const items = perDistrict[i]!.map((f) => f.properties);
    const origin =
      i === 0 || id.includes("mitte")
        ? config.center
        : streetCenter({ lines: [], polygons: d.polys });
    const groups = buildLevels(items, origin);
    const byId = new Map(perDistrict[i]!.map((f) => [f.properties.id, f]));
    const levels = groups.map((streetIds, index) => {
      const levelId = `${id}-${index + 1}`;
      const pts: LonLat[] = [];
      for (const sid of streetIds) {
        const f = byId.get(sid)!;
        f.properties.level = levelId;
        pts.push(...flatCoords(f.geometry));
      }
      return { id: levelId, index, streetIds, bounds: bboxOf(pts) };
    });
    const outline = d.polys.map((p) => p.map((r) => roundCoords(simplifyLine(r, 5), 5)));
    return { id, name: d.name, bounds: bboxOf(outline.flat(2)), outline, levels };
  });
  // Mitte first, rest alphabetical.
  districts.sort(
    (a, b) =>
      Number(b.id.includes("mitte")) - Number(a.id.includes("mitte")) ||
      a.name.localeCompare(b.name, "de"),
  );

  features.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  features.forEach((f, i) => (f.id = i + 1)); // numeric ids for MapLibre feature-state

  const cityBounds = bboxOf(cityPolys.flat(2));
  const meta: CityMeta = {
    id: config.id,
    name: config.name,
    center: config.center,
    bounds: cityBounds,
    generatedAt: new Date().toISOString(),
    osmTimestamp: streetsRes.osm3s?.timestamp_osm_base ?? null,
    attribution: "© OpenStreetMap-Mitwirkende (ODbL)",
    streetCount: features.length,
    formatVersion: DATA_FORMAT_VERSION,
    ...(config.aerial ? { aerial: config.aerial } : {}),
  };
  const levels: CityLevels = { city: config.id, districts };
  const names = [...new Set(features.map((f) => f.properties.name))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );
  const collection: StreetCollection = { type: "FeatureCollection", features };

  const outDir = path.join(ROOT, "apps", "web", "public", "data", config.id);
  await mkdir(outDir, { recursive: true });
  const postcodes: PostcodeCollection = {
    type: "FeatureCollection",
    features: postcodeAreas
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => {
        const polys = a.polys.map((p) => p.map((r) => roundCoords(simplifyLine(r, 10), 5)));
        return {
          type: "Feature" as const,
          properties: { code: a.code, label: roundCoords([labelPoint(a.polys)], 5)[0]! },
          geometry:
            polys.length === 1
              ? { type: "Polygon" as const, coordinates: polys[0]! }
              : { type: "MultiPolygon" as const, coordinates: polys },
        };
      }),
  };
  const outputs: [string, string][] = [
    ["levels.json", JSON.stringify(levels) + "\n"],
    ["names.json", JSON.stringify(names) + "\n"],
    ["streets.geojson", JSON.stringify(collection) + "\n"],
    ["postcodes.geojson", JSON.stringify(postcodes) + "\n"],
  ];
  // Sanity checks: never replace good data with an empty or much smaller data set
  // (an Overpass server may return a partial result).
  if (features.length < MIN_STREETS)
    throw new Error(`only ${features.length} streets – refusing to write data`);
  const previousMeta = await readFile(path.join(outDir, "meta.json"), "utf8")
    .then((t) => JSON.parse(t) as CityMeta)
    .catch(() => null);
  if (
    previousMeta &&
    features.length < previousMeta.streetCount * 0.9 &&
    !process.argv.includes("--allow-shrink")
  )
    throw new Error(
      `street count dropped from ${previousMeta.streetCount} to ${features.length} – refusing to write (use --allow-shrink if intended)`,
    );
  const previous = await Promise.all(
    outputs.map(([f]) => readFile(path.join(outDir, f), "utf8").catch(() => null)),
  );
  // Meta counts as changed when anything but the timestamps differs (e.g. new aerial config).
  const stripTimes = (m: CityMeta | null) =>
    m && JSON.stringify({ ...m, generatedAt: null, osmTimestamp: null });
  const changed =
    outputs.some(([, content], i) => previous[i] !== content) ||
    stripTimes(previousMeta) !== stripTimes(meta);
  // Public Overpass servers lag behind each other; never replace data with an older OSM
  // snapshot (that made the street count flip between runs). A new output file (e.g. the
  // first postcodes.geojson) is always written.
  const stale =
    !!previousMeta?.osmTimestamp &&
    !!meta.osmTimestamp &&
    meta.osmTimestamp < previousMeta.osmTimestamp &&
    previous.every((p) => p !== null) &&
    stripTimes(previousMeta) === stripTimes({ ...meta, streetCount: previousMeta.streetCount });
  if (stale) {
    console.log(
      `[${cityId}] OSM snapshot ${meta.osmTimestamp} is older than the current data (${previousMeta!.osmTimestamp}) – keeping existing files`,
    );
  } else if (changed) {
    for (const [f, content] of outputs) await writeFile(path.join(outDir, f), content);
    await writeFile(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  } else {
    console.log(`[${cityId}] data unchanged – keeping existing files`);
  }

  // Plausibility report
  console.log(
    `\n[${cityId}] ${features.length} streets/squares (${dropped} dropped: outside or < 20 m)`,
  );
  for (const d of districts)
    console.log(
      `  ${d.name.padEnd(26)} ${String(d.levels.reduce((s, l) => s + l.streetIds.length, 0)).padStart(5)} streets, ${d.levels.length} levels`,
    );
  const dup = new Map<string, number>();
  for (const f of features) dup.set(f.properties.name, (dup.get(f.properties.name) ?? 0) + 1);
  const dups = [...dup.entries()].filter(([, n]) => n > 1);
  console.log(
    `  names used by several streets: ${dups.length}${
      dups.length
        ? ` (e.g. ${dups
            .slice(0, 5)
            .map(([n, c]) => `${n}×${c}`)
            .join(", ")})`
        : ""
    }`,
  );
  console.log(`  squares: ${features.filter((f) => f.properties.kind === "square").length}`);
  const withoutPlz = features.filter((f) => !f.properties.postcodes?.length);
  const multiPlz = features.filter((f) => (f.properties.postcodes?.length ?? 0) > 1);
  console.log(
    `  postcode areas: ${postcodeAreas.length} (${postcodeAreas.map((a) => a.code).join(", ")})`,
  );
  console.log(
    `  streets without postcode: ${withoutPlz.length}${
      withoutPlz.length
        ? ` (e.g. ${withoutPlz
            .slice(0, 5)
            .map((f) => f.properties.name)
            .join(", ")})`
        : ""
    }`,
  );
  console.log(`  streets in several postcodes: ${multiPlz.length}`);
  console.log(`  written to ${path.relative(ROOT, outDir)}`);
}

function flatCoords(g: StreetFeature["geometry"]): LonLat[] {
  switch (g.type) {
    case "LineString":
      return g.coordinates;
    case "MultiLineString":
    case "Polygon":
      return g.coordinates.flat();
    case "MultiPolygon":
      return g.coordinates.flat(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
