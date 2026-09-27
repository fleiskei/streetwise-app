import { useEffect, useMemo, useRef, useState } from "react";
import { buildNameIndex, matchesName, normalizeName, suggest } from "@streetwise/core";
import { MapView, type MapMarker, type MapTap } from "../components/MapView";
import { GameShell, SHEET_PADDING } from "../components/GameShell";
import { feedback } from "../lib/feedback";
import type { StreetStatus } from "../lib/mapStyle";
import { markPerfect, recordAnswers } from "../lib/progress";
import { useSettings } from "../lib/settings";
import { useKeyboardInset } from "../lib/useKeyboardInset";
import { MODE_INFO, type ModeProps } from "./types";

type Message = { tone: "ok" | "bad" | "info"; text: string } | null;

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Hard mode: type every street name of the level until the map is complete. */
export function CompleteMode({ data, level, district, ids, back, onDone }: ModeProps) {
  const settings = useSettings();
  const keyboard = useKeyboardInset();
  const index = useMemo(() => buildNameIndex(data.names), [data]);
  const cityNorms = useMemo(() => new Set(index.map((e) => e.norm)), [index]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [gaveUp, setGaveUp] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [shown, setShown] = useState<{ id: string; tone: "correct" | "default" } | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (gaveUp) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [gaveUp]);

  const suggestions = useMemo(
    () => suggest(text, index, { minChars: settings.autocompleteMinChars, limit: 5 }),
    [text, index, settings.autocompleteMinChars],
  );

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const hits = ids.filter((id) => matchesName(v, data.streetsById.get(id)!.properties.name));
    const fresh = hits.filter((id) => !found.has(id));
    if (fresh.length) {
      const next = new Set(found);
      fresh.forEach((id) => next.add(id));
      setFound(next);
      recordAnswers(
        fresh.map((id) => ({ streetId: id, mode: "complete" as const, correct: true })),
      );
      feedback.correct();
      setShown({ id: fresh[0]!, tone: "correct" });
      setMessage({ tone: "ok", text: `${data.streetsById.get(fresh[0]!)!.properties.name} ✓` });
      if (next.size === ids.length) {
        markPerfect(level.id);
        setTimeout(
          () =>
            onDone(
              ids.map((id) => ({ streetId: id, correct: true })),
              { perfect: true },
            ),
          900,
        );
      }
    } else if (hits.length) {
      setMessage({ tone: "info", text: "Schon gefunden." });
    } else if (cityNorms.has(normalizeName(v))) {
      feedback.wrong();
      setMessage({ tone: "bad", text: "Die gibt es – aber nicht in diesem Level." });
    } else {
      feedback.wrong();
      setMessage({ tone: "bad", text: "Unbekannter Straßenname." });
    }
    setText("");
    inputRef.current?.focus();
  };

  const giveUp = () => {
    if (!window.confirm("Aufgeben und die restlichen Straßen anzeigen?")) return;
    const missing = ids.filter((id) => !found.has(id));
    recordAnswers(
      missing.map((id) => ({ streetId: id, mode: "complete" as const, correct: false })),
    );
    setGaveUp(true);
    inputRef.current?.blur();
  };

  const status = useMemo(() => {
    const s: Record<string, StreetStatus> = {};
    for (const id of ids) s[id] = found.has(id) ? "correct" : gaveUp ? "wrong" : "muted";
    if (shown && !found.has(shown.id) && !gaveUp) s[shown.id] = "active";
    return s;
  }, [ids, found, gaveUp, shown]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!shown) return [];
    const p = data.streetsById.get(shown.id)!.properties;
    return [
      {
        key: shown.id,
        at: p.center,
        text: p.name,
        variant: "sign",
        tone: found.has(shown.id) ? "correct" : gaveUp ? "wrong" : "default",
      },
    ];
  }, [shown, data, found, gaveUp]);

  // Tapping a street reveals its name only once it is found (or after giving up).
  const onTap = (tap: MapTap) => {
    const id = tap.street?.properties.id;
    if (id && (found.has(id) || gaveUp)) setShown({ id, tone: "default" });
  };

  const elapsed = Math.floor((now - startedAt) / 1000);

  return (
    <GameShell
      back={back}
      title={MODE_INFO.complete.title}
      subtitle={`${district.name} · Level ${level.index + 1}`}
      progress={found.size / ids.length}
      right={
        <div className="pr-2 text-right text-xs tabular-nums text-[var(--muted)]">
          <div className="text-[15px] font-semibold text-[var(--text)]">
            {found.size}/{ids.length}
          </div>
          {fmtTime(elapsed)}
        </div>
      }
      bottomInset={keyboard}
      map={
        <MapView
          data={data}
          streetIds={ids}
          status={status}
          area={level.bounds}
          outline={district.outline}
          markers={markers}
          onTap={onTap}
          padding={SHEET_PADDING}
          attribution={false}
        />
      }
    >
      {gaveUp ? (
        <div>
          <p className="font-semibold">
            {found.size} von {ids.length} gefunden
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Rot markiert: noch zu lernen. Tippe Straßen an, um die Namen zu sehen.
          </p>
          <button
            onClick={() => onDone(ids.map((id) => ({ streetId: id, correct: found.has(id) })))}
            className="mt-3 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow"
          >
            Auswertung
          </button>
        </div>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  // keep the keyboard open on iOS
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => submit(s)}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-1.5 text-sm font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Straßenname eingeben …"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="done"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] px-3.5 py-3 text-[16px] outline-none focus:border-brand"
            />
            <button type="submit" className="rounded-xl bg-brand px-4 font-semibold text-white">
              OK
            </button>
          </form>
          <div className="mt-2 flex min-h-6 items-center justify-between gap-2 text-sm">
            <span
              className={
                message?.tone === "ok"
                  ? "text-ok"
                  : message?.tone === "bad"
                    ? "text-bad"
                    : "text-[var(--muted)]"
              }
            >
              {message?.text ?? " "}
            </span>
            <button
              onClick={giveUp}
              className="shrink-0 text-[var(--muted)] underline underline-offset-2"
            >
              Aufgeben
            </button>
          </div>
        </>
      )}
    </GameShell>
  );
}
