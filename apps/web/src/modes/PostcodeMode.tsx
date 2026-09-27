import { useEffect, useMemo, useRef, useState } from "react";
import {
  geometryBBox,
  pickPostcodeDistractors,
  postcodeKey,
  shuffle,
  type BBox,
} from "@streetwise/core";
import { MapView, type MapMarker } from "../components/MapView";
import { GameShell, PrimaryButton, SHEET_PADDING } from "../components/GameShell";
import { feedback } from "../lib/feedback";
import { streetsBBox, unionBBox } from "../lib/geo";
import type { StreetStatus } from "../lib/mapStyle";
import { recordAnswers } from "../lib/progress";
import { MODE_INFO, type ModeProps, type RoundResult } from "./types";

/**
 * "PLZ zuordnen" (F-27): a street is highlighted, pick its postcode from four. Any postcode
 * the street lies in counts; afterwards the postcode area is shown so the areas are learned.
 */
export function PostcodeMode({
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
  const codes = useMemo(() => t.postcodes ?? [], [t]);
  const ctx = data.levelById.get(t.level);
  const level = ctx?.level ?? roundLevel;
  const district = ctx?.district ?? roundDistrict;

  const options = useMemo(() => {
    const areas = data.postcodes.map((p) => ({
      code: p.properties.code,
      label: p.properties.label,
    }));
    return shuffle([codes[0]!, ...pickPostcodeDistractors(codes, areas, t.center, 3)]);
  }, [t, codes, data]);

  const answered = chosen !== null;
  const correct = answered && codes.includes(chosen);
  const areas = useMemo(
    () => (answered ? codes.map((c) => data.postcodeByCode.get(c)).filter((a) => !!a) : undefined),
    [answered, codes, data],
  );

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
              text: `${t.name} · ${codes.join(" / ")}`,
              variant: "sign",
              tone: correct ? "correct" : "wrong",
            },
          ]
        : [],
    [answered, correct, t, codes],
  );

  // Before the answer: the street; afterwards: street and its postcode area(s).
  const focus = useMemo<BBox>(() => {
    const street = streetsBBox([target], 400);
    if (!areas?.length) return street;
    return unionBBox([street, ...areas.map((a) => geometryBBox(a.geometry))]);
  }, [target, areas]);

  const next = () => {
    if (index + 1 < ids.length) {
      setIndex(index + 1);
      setChosen(null);
    } else onDone(results.current);
  };
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  useEffect(() => {
    if (!correct) return;
    const timer = setTimeout(() => nextRef.current(), 1600);
    return () => clearTimeout(timer);
  }, [correct, index]);

  const choose = (code: string) => {
    if (answered) return;
    const ok = codes.includes(code);
    setChosen(code);
    results.current.push({ streetId: t.id, correct: ok });
    recordAnswers([{ streetId: postcodeKey(t.id), mode: "postcode", correct: ok }]);
    if (ok) feedback.correct();
    else feedback.wrong();
  };

  return (
    <GameShell
      back={back}
      title={step?.title ?? MODE_INFO.postcode.title}
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
          areas={areas}
          padding={SHEET_PADDING}
          attribution={false}
        />
      }
    >
      <p className="mb-3 text-[15px] font-medium">
        Welche Postleitzahl hat die markierte {t.kind === "square" ? "Fläche" : "Straße"}?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((code) => {
          const isRight = codes.includes(code);
          const cls = !answered
            ? "bg-[var(--surface-solid)] border-[var(--line)] active:scale-[0.98]"
            : isRight
              ? "bg-ok text-white border-ok"
              : chosen === code
                ? "bg-bad text-white border-bad animate-shake"
                : "bg-[var(--surface-solid)] border-[var(--line)] opacity-50";
          return (
            <button
              key={code}
              onClick={() => choose(code)}
              className={`min-h-14 rounded-xl border px-3 py-2 text-center text-xl font-bold tabular-nums tracking-wide transition ${cls}`}
            >
              {code}
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
