/** Shared data model for generated city data (see tools/data) and the app. */

export type LonLat = [lon: number, lat: number];
/** [west, south, east, north] */
export type BBox = [number, number, number, number];

/** Rough class used for level ordering and distractor selection. */
export type StreetKind = "major" | "minor" | "path" | "square";

export interface StreetProps {
  /** Stable id (survives data refreshes as long as name and rough location stay the same). */
  id: string;
  name: string;
  kind: StreetKind;
  district: string;
  level: string;
  /** Higher = more important (bigger road, longer). */
  importance: number;
  /** Representative point for distance calculations. */
  center: LonLat;
  /** Length in metres (0 for squares). */
  length: number;
}

export type StreetGeometry =
  | { type: "LineString"; coordinates: LonLat[] }
  | { type: "MultiLineString"; coordinates: LonLat[][] }
  | { type: "Polygon"; coordinates: LonLat[][] }
  | { type: "MultiPolygon"; coordinates: LonLat[][][] };

export interface StreetFeature {
  type: "Feature";
  id?: number;
  properties: StreetProps;
  geometry: StreetGeometry;
}

export interface StreetCollection {
  type: "FeatureCollection";
  features: StreetFeature[];
}

export interface Level {
  id: string;
  /** 0-based position within the district. */
  index: number;
  streetIds: string[];
  bounds: BBox;
}

export interface District {
  id: string;
  name: string;
  bounds: BBox;
  /** Outline of the district, used to dim everything outside. */
  outline: LonLat[][][];
  levels: Level[];
}

export interface CityMeta {
  id: string;
  name: string;
  center: LonLat;
  bounds: BBox;
  generatedAt: string;
  osmTimestamp: string | null;
  attribution: string;
  streetCount: number;
  /** Increment when the data format changes incompatibly. */
  formatVersion: number;
}

export interface CityLevels {
  city: string;
  districts: District[];
}

export const DATA_FORMAT_VERSION = 1;

/** Quiz modes, see docs/REQUIREMENTS.md 2.2. */
export type Mode = "choice" | "match" | "locate" | "complete";
