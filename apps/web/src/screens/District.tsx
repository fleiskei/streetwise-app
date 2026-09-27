import { districtStatus } from "@streetwise/core";
import { CITY_SCOPE, scopes, type CityData } from "../lib/cityData";
import { useCityMap } from "../lib/cityMap";
import { perfectLevelIds } from "../lib/levelProgress";
import { useProgress } from "../lib/progress";
import { href } from "../lib/router";
import { Centered, LockIcon, ProgressBar, Screen, Stars, TopBar } from "../components/ui";

export function DistrictScreen({ data, districtId }: { data: CityData; districtId: string }) {
  const progress = useProgress();
  const cityMap = useCityMap();
  const perfect = perfectLevelIds(data, cityMap);
  const district = scopes(data).find((d) => d.id === districtId);
  if (!district)
    return (
      <Screen>
        <TopBar title="Unbekannter Bezirk" back={href({ name: "home" })} />
      </Screen>
    );
  const status = districtStatus(district, progress.streets, perfect);

  return (
    <Screen>
      <TopBar title={district.name} back={href({ name: "home" })} />
      {district.id === CITY_SCOPE && (
        <p className="mb-4 px-1 text-sm text-[var(--muted)]">
          Alle Straßen der Stadt, von den Hauptstraßen im Zentrum nach außen – mit Postleitzahlen.
          Dein Lernstand gilt für Bezirke und ganze Stadt gemeinsam.
        </p>
      )}
      {district.levels.length === 0 && <Centered>Keine Straßen in diesem Bezirk.</Centered>}
      <ol className="relative ml-5 border-l-2 border-dashed border-[var(--line)] pb-4">
        {district.levels.map((level, i) => {
          const s = status[i]!;
          const kinds = new Set(
            level.streetIds.map((id) => data.streetsById.get(id)?.properties.kind),
          );
          const subtitle =
            kinds.has("major") || kinds.has("square")
              ? "Hauptstraßen & Plätze"
              : kinds.has("minor")
                ? "Wohnstraßen"
                : "Nebenstraßen";
          return (
            <li key={level.id} className="relative mb-3 pl-7">
              <span
                className={`absolute -left-[17px] top-3 grid h-8 w-8 place-items-center rounded-full text-sm font-bold ring-4 ring-[var(--bg)] ${
                  s.unlocked
                    ? "bg-brand text-white"
                    : "bg-black/10 text-[var(--muted)] dark:bg-white/10"
                }`}
              >
                {s.unlocked ? i + 1 : <LockIcon className="h-4 w-4" />}
              </span>
              <a
                href={s.unlocked ? href({ name: "level", levelId: level.id }) : undefined}
                aria-disabled={!s.unlocked}
                className={`block rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] p-4 transition-transform ${s.unlocked ? "active:scale-[0.99]" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Level {i + 1}</span>
                  <Stars count={s.stars} />
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {subtitle} · {s.total} Straßen · {s.mastered} gemeistert
                </p>
                <ProgressBar value={s.ratio} className="mt-3" />
              </a>
            </li>
          );
        })}
      </ol>
    </Screen>
  );
}
