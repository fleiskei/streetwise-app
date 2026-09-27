import { districtStatus, levelStatus, postcodeProgress, type Mode } from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import { useCityMap } from "../lib/cityMap";
import { perfectLevelIds } from "../lib/levelProgress";
import { useProgress } from "../lib/progress";
import { href } from "../lib/router";
import { MODE_INFO } from "../modes/types";
import { Card, ProgressBar, Screen, Stars, TopBar } from "../components/ui";

const MODE_ORDER: Mode[] = ["choice", "match", "locate", "postcode", "complete"];
const DIFFICULTY_COLOR: Record<string, string> = {
  leicht: "bg-ok/15 text-ok",
  mittel: "bg-brand/15 text-brand",
  schwer: "bg-bad/15 text-bad",
};

export function LevelScreen({ data, levelId }: { data: CityData; levelId: string }) {
  const progress = useProgress();
  const cityMap = useCityMap();
  const perfect = perfectLevelIds(data, cityMap);
  const entry = data.levelById.get(levelId);
  if (!entry)
    return (
      <Screen>
        <TopBar title="Unbekanntes Level" back={href({ name: "home" })} />
      </Screen>
    );
  const { level, district } = entry;
  const status = districtStatus(district, progress.streets, perfect)[level.index]!;
  // Postcode knowledge: separate progress over the level's streets that have a postcode (F-28).
  const plzLevel = {
    ...level,
    streetIds: level.streetIds.filter(
      (id) => data.streetsById.get(id)?.properties.postcodes?.length,
    ),
  };
  const hasPlz = data.postcodes.length > 0 && plzLevel.streetIds.length > 0;
  const plzStatus = levelStatus(plzLevel, postcodeProgress(progress.streets), {
    unlocked: true,
    perfectComplete: false,
  });

  return (
    <Screen>
      <TopBar
        title={`Level ${level.index + 1}`}
        back={href({ name: "district", districtId: district.id })}
      />
      <Card>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--muted)]">{district.name}</span>
          <Stars count={status.stars} />
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums">
          {status.mastered}{" "}
          <span className="text-base font-semibold text-[var(--muted)]">
            / {status.total} gemeistert
          </span>
        </p>
        <ProgressBar value={status.ratio} className="mt-3" />
        {hasPlz && (
          <>
            <p className="mt-3 flex justify-between text-sm">
              <span className="font-medium text-[#7c3aed]">Postleitzahlen</span>
              <span className="tabular-nums text-[var(--muted)]">
                {plzStatus.mastered} / {plzStatus.total} gemeistert
              </span>
            </p>
            <ProgressBar value={plzStatus.ratio} tone="plz" className="mt-1.5" />
          </>
        )}
        <p className="mt-2 text-xs text-[var(--muted)]">
          Ab 80 % gemeistert wird das nächste Level frei. Gemeistert = mehrfach richtig beantwortet.
        </p>
      </Card>

      <a
        href={href({ name: "city", mode: "explore", focus: { kind: "level", id: levelId } })}
        className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] p-4 active:scale-[0.99]"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sign text-white">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
          </svg>
        </span>
        <span>
          <span className="block font-semibold">Erkunden</span>
          <span className="block text-sm text-[var(--muted)]">
            Auf der Stadtkarte Straßen antippen und Namen ansehen – ohne Wertung.
          </span>
        </span>
      </a>

      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Spielen
      </h2>
      <div className="grid gap-3">
        {MODE_ORDER.filter((m) => m !== "postcode" || hasPlz).map((m) => {
          const info = MODE_INFO[m];
          return (
            <Card
              key={m}
              href={
                m === "complete"
                  ? href({ name: "city", mode: "complete", focus: { kind: "level", id: levelId } })
                  : href({ name: "play", levelId, mode: m })
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-semibold">{info.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_COLOR[info.difficulty]}`}
                >
                  {info.difficulty}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{info.description}</p>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
