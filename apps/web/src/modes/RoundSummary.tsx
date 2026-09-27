import { isPostcodeKey, streetIdOfKey, type Mode } from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import { MODE_INFO, type RoundResult } from "./types";

export function RoundSummary({
  data,
  mode,
  title,
  results,
  unlocked,
  perfect,
  back,
  onRetryWrong,
  onAgain,
  backLabel = "Zurück zum Level",
}: {
  data: CityData;
  mode: Mode;
  /** Overrides the mode title (e.g. "Wiederholen"). */
  title?: string;
  results: RoundResult[];
  /** Label of a level unlocked by this round. */
  unlocked: string | null;
  perfect: boolean;
  back: string;
  onRetryWrong: () => void;
  onAgain: () => void;
  backLabel?: string;
}) {
  const correct = results.filter((r) => r.correct).length;
  const ratio = results.length ? correct / results.length : 0;
  const wrong = results.filter((r) => !r.correct);
  const R = 52;
  const C = 2 * Math.PI * R;
  const headline =
    ratio === 1
      ? "Perfekt!"
      : ratio >= 0.8
        ? "Sehr gut!"
        : ratio >= 0.5
          ? "Gut gemacht"
          : "Weiter üben";

  return (
    <div className="min-h-full pt-safe pb-safe px-4">
      <div className="mx-auto max-w-xl py-6 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
          {title ?? MODE_INFO[mode].title}
        </p>
        <div className="relative mx-auto mt-4 h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="10"
              className="stroke-black/8 dark:stroke-white/10"
            />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              stroke={ratio >= 0.8 ? "#16a34a" : ratio >= 0.5 ? "#2563eb" : "#f59e0b"}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ratio)}
              style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.9,.3,1)" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div>
              <div className="text-3xl font-bold tabular-nums">
                {correct}/{results.length}
              </div>
              <div className="text-xs text-[var(--muted)]">richtig</div>
            </div>
          </div>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{headline}</h1>

        {unlocked && (
          <div className="animate-pop mx-auto mt-4 max-w-sm rounded-2xl bg-gradient-to-r from-amber to-orange-400 p-4 font-semibold text-[#3b2300] shadow-lg">
            🎉 {unlocked} freigeschaltet!
          </div>
        )}
        {perfect && (
          <p className="mt-3 text-sm font-medium text-ok">★★★ Karte fehlerfrei vervollständigt</p>
        )}

        {wrong.length > 0 && (
          <div className="mt-6 text-left">
            <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Noch üben
            </h2>
            <div className="flex flex-wrap gap-2">
              {wrong.map((r) => (
                <span key={r.streetId} className="street-sign px-2.5 py-1 text-sm">
                  {data.streetsById.get(streetIdOfKey(r.streetId))?.properties.name}
                  {(mode === "postcode" || isPostcodeKey(r.streetId)) &&
                    ` · ${data.streetsById.get(streetIdOfKey(r.streetId))?.properties.postcodes?.join(" / ") ?? ""}`}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-2">
          {wrong.length > 0 && (
            <button
              onClick={onRetryWrong}
              className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow active:scale-[0.99]"
            >
              Fehler üben ({wrong.length})
            </button>
          )}
          <button
            onClick={onAgain}
            className={`w-full rounded-xl px-4 py-3 font-semibold active:scale-[0.99] ${wrong.length ? "border border-[var(--line)]" : "bg-brand text-white shadow"}`}
          >
            Neue Runde
          </button>
          <a href={back} className="w-full rounded-xl px-4 py-3 font-medium text-[var(--muted)]">
            {backLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
