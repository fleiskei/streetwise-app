import { useEffect, useMemo, useRef, useState } from "react";
import { distanceToGeometry, normalizeName, type LonLat } from "@streetwise/core";
import { MapView, type MapMarker, type MapTap } from "../components/MapView";
import { GameShell, PrimaryButton, SHEET_PADDING } from "../components/GameShell";
import { feedback } from "../lib/feedback";
import { pointBBox, streetsBBox, unionBBox, minSizeBBox } from "../lib/geo";
import type { StreetStatus } from "../lib/mapStyle";
import { recordAnswers } from "../lib/progress";
import { MODE_INFO, questionContext, type ModeProps, type RoundResult } from "./types";

interface Attempt {
  at: LonLat;
  correct: boolean;
  distance: number;
}

export function LocateMode({
  data,
  level: roundLevel,
  district: roundDistrict,
  ids,
  back,
  onDone,
  step,
}: ModeProps) {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const results = useRef<RoundResult[]>([]);
  const target = data.streetsById.get(ids[index]!)!;
  const t = target.properties;
  const { level, district } = questionContext(data, roundLevel, roundDistrict, t.id);

  const status = useMemo(() => {
    const s: Record<string, StreetStatus> = {};
    for (const id of level.streetIds) s[id] = "muted";
    if (attempt) s[t.id] = attempt.correct ? "correct" : "wrong";
    return s;
  }, [level, t, attempt]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!attempt) return [];
    const m: MapMarker[] = [
      {
        key: "sign",
        at: t.center,
        text: t.name,
        variant: "sign",
        tone: attempt.correct ? "correct" : "wrong",
      },
    ];
    if (!attempt.correct)
      m.push({
        key: "miss",
        at: attempt.at,
        text: `${Math.round(attempt.distance)} m daneben`,
        variant: "note",
      });
    return m;
  }, [attempt, t]);

  const focus = useMemo(
    () =>
      attempt && !attempt.correct
        ? minSizeBBox(unionBBox([streetsBBox([target], 0), pointBBox(attempt.at)]), 300)
        : null,
    [attempt, target],
  );

  const next = () => {
    if (index + 1 < ids.length) {
      setIndex(index + 1);
      setAttempt(null);
    } else onDone(results.current);
  };
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  });
  useEffect(() => {
    if (!attempt?.correct) return;
    const timer = setTimeout(() => nextRef.current(), 1000);
    return () => clearTimeout(timer);
  }, [attempt]);

  const onTap = (tap: MapTap) => {
    if (attempt) return;
    const distance = distanceToGeometry(tap.at, target.geometry);
    // Also accept a namesake segment (same name, merged separately).
    const correct =
      distance <= tap.tolerance ||
      (!!tap.street && normalizeName(tap.street.properties.name) === normalizeName(t.name));
    setAttempt({ at: tap.at, correct, distance });
    results.current.push({ streetId: t.id, correct });
    recordAnswers([{ streetId: t.id, mode: "locate", correct }]);
    if (correct) feedback.correct();
    else feedback.wrong();
  };

  return (
    <GameShell
      back={back}
      title={step?.title ?? MODE_INFO.locate.title}
      subtitle={`${district.name} · Level ${level.index + 1} · ${(step?.index ?? index) + 1} von ${step?.total ?? ids.length}`}
      progress={((step?.index ?? 0) + index + (attempt ? 1 : 0)) / (step?.total ?? ids.length)}
      map={
        <MapView
          data={data}
          streetIds={level.streetIds}
          status={status}
          area={level.bounds}
          focus={focus}
          outline={district.outline}
          markers={markers}
          onTap={onTap}
          padding={SHEET_PADDING}
          attribution={false}
        />
      }
    >
      <p className="text-sm text-[var(--muted)]">
        {attempt
          ? attempt.correct
            ? "Richtig!"
            : "Leider daneben – hier ist sie:"
          : "Tippe auf der Karte auf:"}
      </p>
      <div className="mt-2 flex">
        <span className="street-sign px-4 py-2 text-xl">{t.name}</span>
      </div>
      {attempt && !attempt.correct && (
        <PrimaryButton onClick={next} className="mt-4">
          Weiter
        </PrimaryButton>
      )}
    </GameShell>
  );
}
