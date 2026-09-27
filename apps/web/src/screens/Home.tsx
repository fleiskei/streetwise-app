import { districtStatus } from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import { loadProgress } from "../lib/progress";
import { href } from "../lib/router";
import { Card, ProgressBar, Screen, TopBar } from "../components/ui";

export function Home({ data }: { data: CityData }) {
  const progress = loadProgress();
  const districts = data.levels.districts.map((d) => {
    const status = districtStatus(d, progress);
    const total = status.reduce((s, l) => s + l.total, 0);
    const mastered = status.reduce((s, l) => s + l.mastered, 0);
    return { d, total, mastered, levels: status.length };
  });
  const total = districts.reduce((s, x) => s + x.total, 0);
  const mastered = districts.reduce((s, x) => s + x.mastered, 0);

  return (
    <Screen>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" /> Streetwise
          </span>
        }
        right={
          <a
            href={href({ name: "account" })}
            aria-label="Konto"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </a>
        }
      />

      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-sign to-[#0b1220] p-5 text-white shadow-lg">
        <p className="text-sm/5 opacity-80">{data.meta.name}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {mastered} <span className="text-lg font-semibold opacity-70">/ {total} Straßen</span>
        </p>
        <p className="text-sm opacity-80">gemeistert</p>
        <ProgressBar value={total ? mastered / total : 0} className="mt-4 bg-white/20" />
        <div className="street-sign absolute right-4 top-4 rotate-3 px-2.5 py-0.5 text-sm">
          ? ? ?straße
        </div>
      </section>

      <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Stadtbezirke
      </h2>
      <div className="grid gap-3">
        {districts.map(({ d, total, mastered, levels }) => (
          <Card key={d.id} href={href({ name: "district", districtId: d.id })}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[17px] font-semibold">{d.name}</span>
              <span className="text-sm tabular-nums text-[var(--muted)]">
                {total} Straßen · {levels} Level
              </span>
            </div>
            <ProgressBar value={total ? mastered / total : 0} className="mt-3" />
          </Card>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-[var(--muted)]">
        Kartendaten {data.meta.attribution}
        {data.meta.osmTimestamp &&
          ` · Stand ${new Date(data.meta.osmTimestamp).toLocaleDateString("de-DE")}`}
      </p>
    </Screen>
  );
}
