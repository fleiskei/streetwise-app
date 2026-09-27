import { useMemo, useState } from "react";
import type { LonLat, StreetFeature } from "@streetwise/core";
import type { MapMarker } from "../components/MapView";
import type { CityData } from "../lib/cityData";
import { href } from "../lib/router";
import { MapView } from "../components/MapView";
import type { StreetStatus } from "../lib/mapStyle";

/** Explore a level: tap streets to reveal their names. The quiz modes build on this view (M2). */
export function Explore({ data, levelId }: { data: CityData; levelId: string }) {
  const entry = data.levelById.get(levelId);
  const [selected, setSelected] = useState<{ street: StreetFeature; at: LonLat } | null>(null);
  const [missed, setMissed] = useState(false);
  const status = useMemo<Record<string, StreetStatus>>(
    () => (selected ? { [selected.street.properties.id]: "active" } : {}),
    [selected],
  );
  const markers = useMemo<MapMarker[]>(
    () =>
      selected
        ? [{ key: "sel", at: selected.at, text: selected.street.properties.name, variant: "sign" }]
        : [],
    [selected],
  );

  if (!entry) return null;
  const { level, district } = entry;

  return (
    <div className="fixed inset-0">
      <MapView
        data={data}
        streetIds={level.streetIds}
        status={status}
        area={level.bounds}
        outline={district.outline}
        markers={markers}
        padding={{ top: 110, bottom: 170, left: 24, right: 24 }}
        attribution={false}
        onTap={({ street, at }) => {
          setMissed(!street);
          setSelected(street ? { street, at } : null);
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 pt-safe px-3">
        <div className="glass pointer-events-auto mx-auto flex max-w-xl items-center gap-2 rounded-2xl px-2 py-1.5 shadow-lg">
          <a
            href={href({ name: "level", levelId: level.id })}
            aria-label="Zurück"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {district.name} · Level {level.index + 1}
            </p>
            <p className="text-xs text-[var(--muted)]">
              Erkunden · {level.streetIds.length} Straßen
            </p>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-safe px-3">
        <div className="glass pointer-events-auto mx-auto max-w-xl rounded-3xl p-4 shadow-xl">
          <p className="text-[15px] font-medium">
            {selected ? (
              <>
                <span className="text-[var(--muted)]">Das ist die </span>
                {selected.street.properties.name}
              </>
            ) : missed ? (
              "Keine markierte Straße getroffen – tippe näher an eine blaue Linie."
            ) : (
              "Tippe auf eine blaue Straße, um ihren Namen zu sehen."
            )}
          </p>
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              {data.meta.attribution}
            </a>
            {data.hasTiles && " · Protomaps"}
          </p>
        </div>
      </div>
    </div>
  );
}
