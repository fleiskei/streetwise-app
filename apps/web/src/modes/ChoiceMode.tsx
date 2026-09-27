import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeName, pickDistractors, shuffle, type StreetProps } from "@streetwise/core";
import { MapView, type MapMarker } from "../components/MapView";
import { GameShell, PrimaryButton, SHEET_PADDING } from "../components/GameShell";
import { feedback } from "../lib/feedback";
import { streetsBBox } from "../lib/geo";
import type { StreetStatus } from "../lib/mapStyle";
import { recordAnswers } from "../lib/progress";
import { MODE_INFO, questionContext, type ModeProps, type RoundResult } from "./types";

export function ChoiceMode({
  data,
  level: roundLevel,
  district: roundDistrict,
  ids,
  back,
  onDone,
  step,
}: ModeProps) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const results = useRef<RoundResult[]>([]);
  const target = data.streetsById.get(ids[index]!)!;
  const t = target.properties;
  const { level, district } = questionContext(data, roundLevel, roundDistrict, t.id);

  // Distractors from the same scope (district or the whole city).
  const candidates = useMemo(
    () =>
      district.levels.flatMap((l) => l.streetIds).map((id) => data.streetsById.get(id)!.properties),
    [data, district],
  );
  const options = useMemo<StreetProps[]>(
    () => shuffle([t, ...pickDistractors(t, candidates, 3)]),
    [t, candidates],
  );

  const answered = chosen !== null;
  const correct = answered && normalizeName(chosen) === normalizeName(t.name);

  const status = useMemo(() => {
    const s: Record<string, StreetStatus> = {};
    for (const id of level.streetIds) s[id] = "muted";
    s[t.id] = answered ? (correct ? "correct" : "wrong") : "active";
    return s;
  }, [level, t, answered, correct]);
  const markers = useMemo<MapMarker[]>(
    () =>
      answered
        ? [
            {
              key: t.id,
              at: t.center,
              text: t.name,
              variant: "sign",
              tone: correct ? "correct" : "wrong",
            },
          ]
        : [],
    [answered, correct, t],
  );
  const focus = useMemo(() => streetsBBox([target], 350), [target]);

  const next = () => {
    if (index + 1 < ids.length) {
      setIndex(index + 1);
      setChosen(null);
    } else onDone(results.current);
  };

  // Correct answers advance automatically.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  useEffect(() => {
    if (!correct) return;
    const timer = setTimeout(() => nextRef.current(), 900);
    return () => clearTimeout(timer);
  }, [correct, index]);

  const choose = (name: string) => {
    if (answered) return;
    const ok = normalizeName(name) === normalizeName(t.name);
    setChosen(name);
    results.current.push({ streetId: t.id, correct: ok });
    recordAnswers([{ streetId: t.id, mode: "choice", correct: ok }]);
    if (ok) feedback.correct();
    else feedback.wrong();
  };

  return (
    <GameShell
      back={back}
      title={step?.title ?? MODE_INFO.choice.title}
      subtitle={`${district.name} · Level ${level.index + 1} · ${(step?.index ?? index) + 1} von ${step?.total ?? ids.length}`}
      progress={((step?.index ?? 0) + index + (answered ? 1 : 0)) / (step?.total ?? ids.length)}
      map={
        <MapView
          data={data}
          streetIds={level.streetIds}
          status={status}
          area={level.bounds}
          focus={focus}
          outline={district.outline}
          markers={markers}
          padding={SHEET_PADDING}
          attribution={false}
        />
      }
    >
      <p className="mb-3 text-[15px] font-medium">
        Wie heißt die markierte {t.kind === "square" ? "Fläche" : "Straße"}?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const isTarget = normalizeName(o.name) === normalizeName(t.name);
          const isChosen = chosen === o.name;
          const cls = !answered
            ? "bg-[var(--surface-solid)] border-[var(--line)] active:scale-[0.98]"
            : isTarget
              ? "bg-ok text-white border-ok"
              : isChosen
                ? "bg-bad text-white border-bad animate-shake"
                : "bg-[var(--surface-solid)] border-[var(--line)] opacity-50";
          return (
            <button
              key={o.id}
              onClick={() => choose(o.name)}
              className={`min-h-14 rounded-xl border px-3 py-2 text-left text-[15px] font-semibold leading-tight transition ${cls}`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
      {answered && !correct && (
        <PrimaryButton onClick={next} className="mt-3">
          Weiter
        </PrimaryButton>
      )}
    </GameShell>
  );
}
