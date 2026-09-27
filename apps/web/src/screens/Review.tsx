import { useRef, useState } from "react";
import { dueStreetIds, isPostcodeKey, nextDueAt, streetIdOfKey } from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import { feedback } from "../lib/feedback";
import { newlyUnlocked, unlockedLevelIds } from "../lib/levelProgress";
import { progressStore } from "../lib/progress";
import { href } from "../lib/router";
import { ChoiceMode } from "../modes/ChoiceMode";
import { LocateMode } from "../modes/LocateMode";
import { PostcodeMode } from "../modes/PostcodeMode";
import { RoundSummary } from "../modes/RoundSummary";
import type { RoundResult } from "../modes/types";
import { Centered, Screen, TopBar } from "../components/ui";

/** Streets per review session. */
const REVIEW_SIZE = 15;

type Phase =
  | { kind: "play"; ids: string[]; round: number; unlockedBefore: Set<string> }
  | { kind: "summary"; results: RoundResult[]; unlocked: string | null };

/**
 * Spaced-repetition review over all levels (REQUIREMENTS F-15). Weak streets (box < 2) are
 * asked as multiple choice, stronger ones by tapping them on the map.
 */
export function Review({ data }: { data: CityData }) {
  const start = (round: number, ids?: string[]): Phase => ({
    kind: "play",
    ids: (ids ?? dueStreetIds(progressStore.get().streets, Date.now(), REVIEW_SIZE)).filter(
      (key) => {
        // keys are street ids or "plz:<street id>" (postcode knowledge)
        const street = data.streetsById.get(streetIdOfKey(key));
        return !!street && (!isPostcodeKey(key) || !!street.properties.postcodes?.length);
      },
    ),
    round,
    unlockedBefore: unlockedLevelIds(data, progressStore.get()),
  });
  const [phase, setPhase] = useState<Phase>(() => start(0));
  const [index, setIndex] = useState(0);
  const results = useRef<RoundResult[]>([]);
  const [openedAt] = useState(() => Date.now());
  const back = href({ name: "home" });

  if (phase.kind === "summary")
    return (
      <RoundSummary
        data={data}
        mode="choice"
        title="Wiederholen"
        results={phase.results}
        unlocked={phase.unlocked}
        perfect={false}
        back={back}
        backLabel="Zur Startseite"
        onRetryWrong={() => {
          results.current = [];
          setIndex(0);
          setPhase(
            start(
              Date.now(),
              phase.results.filter((r) => !r.correct).map((r) => r.streetId),
            ),
          );
        }}
        onAgain={() => {
          results.current = [];
          setIndex(0);
          setPhase(start(Date.now()));
        }}
      />
    );

  if (phase.ids.length === 0) {
    const next = nextDueAt(progressStore.get().streets, openedAt);
    return (
      <Screen>
        <TopBar title="Wiederholen" back={back} />
        <Centered>
          <div className="max-w-xs">
            <p className="text-4xl">✨</p>
            <p className="mt-3 text-lg font-semibold text-[var(--text)]">Nichts fällig</p>
            <p className="mt-1 text-sm">
              {next
                ? `Die nächste Wiederholung ist ${new Date(next).toLocaleString("de-DE", { weekday: "long", hour: "2-digit", minute: "2-digit" })} fällig.`
                : "Spiele zuerst ein paar Level – dann kommen hier deine Wiederholungen."}
            </p>
            <a
              href={back}
              className="mt-5 inline-block rounded-xl bg-brand px-5 py-3 font-semibold text-white"
            >
              Zur Startseite
            </a>
          </div>
        </Centered>
      </Screen>
    );
  }

  const key = phase.ids[index]!;
  const id = streetIdOfKey(key);
  const street = data.streetsById.get(id)!;
  const ctx = data.levelById.get(street.properties.level)!;
  const weak = (progressStore.get().streets[key]?.box ?? 0) < 2;
  const Mode = isPostcodeKey(key) ? PostcodeMode : weak ? ChoiceMode : LocateMode;

  return (
    <Mode
      key={`${phase.round}-${index}`}
      data={data}
      level={ctx.level}
      district={ctx.district}
      ids={[id]}
      back={back}
      step={{ index, total: phase.ids.length, title: "Wiederholen" }}
      onDone={(r) => {
        // keep the progress key so "Fehler üben" asks the same kind of question again
        results.current.push(...r.map((x) => ({ ...x, streetId: key })));
        if (index + 1 < phase.ids.length) {
          setIndex(index + 1);
          return;
        }
        const unlocked = newlyUnlocked(
          data,
          phase.unlockedBefore,
          unlockedLevelIds(data, progressStore.get()),
        );
        if (unlocked) feedback.levelUp();
        setPhase({ kind: "summary", results: [...results.current], unlocked });
      }}
    />
  );
}
