import { useState } from "react";
import { pickRoundStreets, ROUND_SIZE } from "@streetwise/core";
import type { CityData } from "../lib/cityData";
import { feedback } from "../lib/feedback";
import { newlyUnlocked, unlockedLevelIds } from "../lib/levelProgress";
import { progressStore } from "../lib/progress";
import { href, type LevelMode } from "../lib/router";
import { ChoiceMode } from "../modes/ChoiceMode";
import { LocateMode } from "../modes/LocateMode";
import { MatchMode } from "../modes/MatchMode";
import { RoundSummary } from "../modes/RoundSummary";
import type { ModeProps, RoundResult } from "../modes/types";

const MODES: Record<LevelMode, (p: ModeProps) => React.ReactNode> = {
  choice: ChoiceMode,
  match: MatchMode,
  locate: LocateMode,
};

type Phase =
  | { kind: "play"; ids: string[]; round: number; unlockedBefore: Set<string> }
  | { kind: "summary"; results: RoundResult[]; unlocked: string | null; perfect: boolean };

export function Play({
  data,
  levelId,
  mode,
}: {
  data: CityData;
  levelId: string;
  mode: LevelMode;
}) {
  const entry = data.levelById.get(levelId);

  const newRound = (round: number, ids?: string[]): Phase => {
    const all = entry?.level.streetIds ?? [];
    const picked =
      ids ?? pickRoundStreets(all, progressStore.get().streets, ROUND_SIZE, Date.now());
    return {
      kind: "play",
      ids: picked,
      round,
      unlockedBefore: unlockedLevelIds(data, progressStore.get()),
    };
  };
  const [phase, setPhase] = useState<Phase>(() => newRound(0));

  if (!entry) return null;
  const { level, district } = entry;
  const back = href({ name: "level", levelId });

  if (phase.kind === "summary")
    return (
      <RoundSummary
        data={data}
        mode={mode}
        results={phase.results}
        unlocked={phase.unlocked}
        perfect={phase.perfect}
        back={back}
        onRetryWrong={() =>
          setPhase(
            newRound(
              Date.now(),
              phase.results.filter((r) => !r.correct).map((r) => r.streetId),
            ),
          )
        }
        onAgain={() => setPhase(newRound(Date.now()))}
      />
    );

  const Component = MODES[mode];
  return (
    <Component
      key={phase.round}
      data={data}
      level={level}
      district={district}
      ids={phase.ids}
      back={back}
      onDone={(results, opts) => {
        const unlocked = newlyUnlocked(
          data,
          phase.unlockedBefore,
          unlockedLevelIds(data, progressStore.get()),
        );
        if (unlocked) feedback.levelUp();
        setPhase({ kind: "summary", results, unlocked, perfect: !!opts?.perfect });
      }}
    />
  );
}
