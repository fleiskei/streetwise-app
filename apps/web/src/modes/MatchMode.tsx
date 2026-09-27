import { useMemo, useRef, useState } from "react";
import { chunkBoards, normalizeName, shuffle } from "@streetwise/core";
import { MapView, type MapMarker, type MapTap } from "../components/MapView";
import { GameShell, SHEET_PADDING } from "../components/GameShell";
import { feedback } from "../lib/feedback";
import { streetsBBox } from "../lib/geo";
import type { StreetStatus } from "../lib/mapStyle";
import { recordAnswers } from "../lib/progress";
import { MODE_INFO, type ModeProps, type RoundResult } from "./types";

/** Matching: numbered streets on the map, name chips below; pick a name, then a street (or vice versa). */
export function MatchMode({ data, level, district, ids, back, onDone }: ModeProps) {
  const boards = useMemo(() => chunkBoards(ids), [ids]);
  const [boardIdx, setBoardIdx] = useState(0);
  const board = boards[boardIdx]!;
  const chips = useMemo(() => shuffle(board), [board]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Set<string>>(new Set());
  const [chip, setChip] = useState<string | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const results = useRef<RoundResult[]>([]);

  const props = (id: string) => data.streetsById.get(id)!.properties;
  const numberOf = (id: string) => board.indexOf(id) + 1;

  const evaluate = (chipId: string, streetId: string) => {
    setChip(null);
    setStreet(null);
    const ok =
      chipId === streetId ||
      normalizeName(props(chipId).name) === normalizeName(props(streetId).name);
    if (ok) {
      feedback.correct();
      const nextMatched = new Set(matched).add(streetId);
      setMatched(nextMatched);
      if (nextMatched.size === board.length) finishBoard();
    } else {
      feedback.wrong();
      setMissed(new Set(missed).add(chipId));
      setFlash(streetId);
      setTimeout(() => setFlash(null), 600);
    }
  };

  const finishBoard = () => {
    const boardResults = board.map((id) => ({ streetId: id, correct: !missed.has(id) }));
    results.current.push(...boardResults);
    recordAnswers(boardResults.map((r) => ({ ...r, mode: "match" as const })));
    setTimeout(() => {
      if (boardIdx + 1 < boards.length) {
        setBoardIdx(boardIdx + 1);
        setMatched(new Set());
        setMissed(new Set());
      } else onDone(results.current);
    }, 700);
  };

  const pickChip = (id: string) => {
    if (matched.has(id)) return;
    feedback.tap();
    if (street) evaluate(id, street);
    else setChip(chip === id ? null : id);
  };
  const pickStreet = (id: string) => {
    if (!board.includes(id) || matched.has(id)) return;
    feedback.tap();
    if (chip) evaluate(chip, id);
    else setStreet(street === id ? null : id);
  };

  const status = useMemo(() => {
    const s: Record<string, StreetStatus> = {};
    for (const id of level.streetIds) s[id] = "muted";
    for (const id of board)
      s[id] = matched.has(id)
        ? "correct"
        : id === flash
          ? "wrong"
          : id === street
            ? "active"
            : "idle";
    return s;
  }, [level, board, matched, flash, street]);

  const markers = useMemo<MapMarker[]>(
    () =>
      board.map((id) => {
        const p = props(id);
        return matched.has(id)
          ? { key: id, at: p.center, text: p.name, variant: "sign", tone: "correct" }
          : {
              key: id,
              at: p.center,
              text: String(numberOf(id)),
              variant: "badge",
              tone: id === flash ? "wrong" : id === street ? "active" : "default",
              onClick: () => pickStreet(id),
            };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, matched, flash, street, chip],
  );
  const focus = useMemo(
    () =>
      streetsBBox(
        board.map((id) => data.streetsById.get(id)!),
        300,
      ),
    [board, data],
  );

  const onTap = (tap: MapTap) => {
    if (tap.street) pickStreet(tap.street.properties.id);
  };

  return (
    <GameShell
      back={back}
      title={MODE_INFO.match.title}
      subtitle={`${district.name} · Level ${level.index + 1} · Runde ${boardIdx + 1} von ${boards.length}`}
      progress={
        (boards.slice(0, boardIdx).reduce((n, b) => n + b.length, 0) + matched.size) / ids.length
      }
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
      <p className="mb-3 text-[15px] font-medium">
        {chip
          ? `Wo ist „${props(chip).name}“? Tippe die Nummer an.`
          : street
            ? `Welcher Name gehört zu Nr. ${numberOf(street)}?`
            : "Wähle einen Namen und dann die passende Nummer."}
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map((id) => {
          const done = matched.has(id);
          return (
            <button
              key={id}
              disabled={done}
              onClick={() => pickChip(id)}
              className={`rounded-full border px-3.5 py-2 text-[15px] font-semibold transition ${
                done
                  ? "border-transparent bg-ok/15 text-ok line-through opacity-60"
                  : chip === id
                    ? "border-sign bg-sign text-white shadow"
                    : "border-[var(--line)] bg-[var(--surface-solid)] active:scale-[0.97]"
              }`}
            >
              {props(id).name}
            </button>
          );
        })}
      </div>
    </GameShell>
  );
}
