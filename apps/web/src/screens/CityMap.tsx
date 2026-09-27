import { useMemo, useRef, useState } from "react";
import {
  buildNameIndex,
  haversine,
  matchesName,
  normalizeName,
  suggest,
  type BBox,
  type LonLat,
} from "@streetwise/core";
import { MapView, type MapMarker, type MapTap } from "../components/MapView";
import { GameShell } from "../components/GameShell";
import { CITY_SCOPE, type CityData } from "../lib/cityData";
import { addFound, addHint, resetCityMap, useCityMap } from "../lib/cityMap";
import { feedback } from "../lib/feedback";
import { postcodeRevealBBox, streetsBBox } from "../lib/geo";
import type { StreetStatus } from "../lib/mapStyle";
import { recordAnswers } from "../lib/progress";
import { href, type CityFocus, type CityMode } from "../lib/router";
import { useSettings } from "../lib/settings";
import { useKeyboardInset } from "../lib/useKeyboardInset";

type Message = { tone: "ok" | "bad" | "info"; text: string } | null;

const PADDING = { top: 150, bottom: 210, left: 24, right: 24 };
const fmt = (n: number) => n.toLocaleString("de-DE");

/**
 * City map (REQUIREMENTS F-24): explore and complete the whole city on one persistent map,
 * optionally filtered to a district.
 */
export function CityMap({
  data,
  mode,
  focus,
}: {
  data: CityData;
  mode: CityMode;
  focus?: CityFocus;
}) {
  const cityMap = useCityMap();
  const settings = useSettings();
  const keyboard = useKeyboardInset();

  const initial = useMemo(() => {
    if (focus?.kind === "level") {
      const e = data.levelById.get(focus.id);
      // A level of "Ganz Aachen" opens the whole city, framed on the level.
      if (e)
        return {
          district: e.district.id === CITY_SCOPE ? null : e.district.id,
          view: e.level.bounds,
        };
    }
    if (focus?.kind === "district") {
      const d = data.levels.districts.find((x) => x.id === focus.id);
      if (d) return { district: d.id, view: d.bounds };
    }
    return { district: null as string | null, view: data.meta.bounds };
  }, [data, focus]);

  const [district, setDistrict] = useState<string | null>(initial.district);
  const [view, setView] = useState<BBox | null>(initial.view);
  const [selected, setSelected] = useState<{ id: string; at: LonLat } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  /** Street selected in "complete" mode whose name is asked. */
  const [target, setTarget] = useState<string | null>(null);
  const wrongOnce = useRef(false);
  /** Mirrors `target` synchronously (needed before React re-renders). */
  const targetRef = useRef<string | null>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [overview, setOverview] = useState(false);
  const center = useRef<LonLat>(data.meta.center);
  const visible = useRef<BBox>(data.meta.bounds);
  const inputRef = useRef<HTMLInputElement>(null);

  const byDistrict = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of data.levels.districts)
      m.set(
        d.id,
        d.levels.flatMap((l) => l.streetIds),
      );
    return m;
  }, [data]);
  const allIds = useMemo(() => [...byDistrict.values()].flat(), [byDistrict]);
  const scopeIds = district ? (byDistrict.get(district) ?? []) : allIds;
  const districtObj = district ? data.levels.districts.find((d) => d.id === district) : undefined;
  // Dim outside the selected district; no dimming for the whole city.
  const outline = districtObj?.outline;
  const index = useMemo(() => buildNameIndex(data.names), [data]);
  const cityNorms = useMemo(() => new Set(index.map((e) => e.norm)), [index]);
  const name = (id: string) => data.streetsById.get(id)!.properties.name;

  // Explore with the PLZ button on: a tapped street shows its postcode area(s) (F-30).
  const showPlz = mode === "explore" && settings.postcodes && data.postcodes.length > 0;
  const selectedCodes = selected
    ? (data.streetsById.get(selected.id)!.properties.postcodes ?? [])
    : [];
  const plzAreas = useMemo(
    () =>
      showPlz && selected
        ? (data.streetsById.get(selected.id)!.properties.postcodes ?? [])
            .map((c) => data.postcodeByCode.get(c))
            .filter((a) => !!a)
        : undefined,
    [showPlz, selected, data],
  );

  const foundIn = (ids: string[]) => ids.reduce((n, id) => n + (cityMap.found[id] ? 1 : 0), 0);
  const foundCount = foundIn(scopeIds);

  const status = useMemo(() => {
    const s: Record<string, StreetStatus> = {};
    for (const id of Object.keys(cityMap.found)) s[id] = "correct";
    if (mode === "complete" && target) s[target] = "active";
    if (mode === "explore" && selected) s[selected.id] = "active";
    return s;
  }, [cityMap, mode, selected, target]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (mode === "explore" && selected)
      m.push({
        key: "sel",
        at: selected.at,
        text:
          showPlz && selectedCodes.length
            ? `${name(selected.id)} · ${selectedCodes.join(" / ")}`
            : name(selected.id),
        variant: "sign",
      });
    if (mode === "complete") {
      if (shown && cityMap.found[shown]) {
        const p = data.streetsById.get(shown)!.properties;
        m.push({
          key: `found-${shown}`,
          at: p.center,
          text: p.name,
          variant: "sign",
          tone: "correct",
        });
      }
      if (target) {
        const p = data.streetsById.get(target)!.properties;
        const hinted = target in cityMap.hinted;
        m.push({
          key: `target-${target}-${hinted}`,
          at: p.center,
          text: hinted ? `${p.name.slice(0, 3)}…` : "?",
          variant: hinted ? "note" : "badge",
          tone: "active",
        });
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, shown, target, cityMap, data, showPlz]);

  const setMode = (m: CityMode) => {
    setMessage(null);
    setSelected(null);
    setTarget(null);
    // Same component instance (key="city" in App): camera and filter stay as they are.
    window.location.replace(href({ name: "city", mode: m, focus }));
  };

  const chooseDistrict = (id: string | null) => {
    setDistrict(id);
    setOverview(false);
    setTarget(null);
    const d = id ? data.levels.districts.find((x) => x.id === id) : undefined;
    setView(d ? d.bounds : data.meta.bounds);
  };

  /** Nearest street in scope that is still missing (optionally excluding one). */
  const nearestMissing = (from: LonLat): string | null => {
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of scopeIds) {
      if (cityMap.found[id]) continue;
      const d = haversine(from, data.streetsById.get(id)!.properties.center);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };

  const selectTarget = (id: string | null) => {
    targetRef.current = id;
    setTarget(id);
    wrongOnce.current = false;
    // Focus right away, still inside the tap: iOS opens the keyboard only then.
    if (id) inputRef.current?.focus({ preventScroll: true });
  };

  /** Checks the typed name against the selected street. */
  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    if (!target) {
      setMessage({ tone: "info", text: "Tippe zuerst eine graue Straße auf der Karte an." });
      return;
    }
    if (matchesName(v, name(target))) {
      const counted = addFound([target]);
      recordAnswers(
        counted.map((id) => ({ streetId: id, mode: "complete" as const, correct: true })),
      );
      feedback.correct();
      setShown(target);
      setMessage({ tone: "ok", text: `${name(target)} ✓ – tippe die nächste Straße an` });
      // The next street is chosen by the user (tap), not automatically.
      selectTarget(null);
      inputRef.current?.blur();
    } else {
      feedback.wrong();
      if (!wrongOnce.current) {
        wrongOnce.current = true;
        recordAnswers([{ streetId: target, mode: "complete", correct: false }]);
      }
      setMessage({
        tone: "bad",
        text: cityNorms.has(normalizeName(v))
          ? "Nicht richtig – versuch's nochmal oder nimm einen Tipp."
          : "Unbekannter Straßenname.",
      });
    }
    setText("");
  };

  const hint = () => {
    const id = target ?? nearestMissing(center.current);
    if (!id) return;
    addHint(id);
    selectTarget(id);
    if (!target) setView(streetsBBox([data.streetsById.get(id)!], 600));
    setMessage({
      tone: "info",
      text: `Tipp: beginnt mit „${name(id).slice(0, 3)}…“ (zählt nicht für den Lernstand)`,
    });
  };

  const reset = () => {
    if (
      !window.confirm(
        "Alle eingetragenen Straßen der Stadtkarte zurücksetzen? Dein Lernstand bleibt erhalten.",
      )
    )
      return;
    resetCityMap();
    setShown(null);
    selectTarget(null);
    setMessage({ tone: "info", text: "Stadtkarte zurückgesetzt." });
  };

  const onTap = (tap: MapTap) => {
    const id = tap.street?.properties.id ?? null;
    if (mode === "explore") {
      setSelected(id ? { id, at: tap.at } : null);
      if (id && showPlz) {
        const street = data.streetsById.get(id)!;
        const areas = (street.properties.postcodes ?? [])
          .map((c) => data.postcodeByCode.get(c))
          .filter((a) => !!a);
        if (areas.length) setView(postcodeRevealBBox(street, areas));
      }
      return;
    }
    if (!id) return;
    if (cityMap.found[id]) {
      setShown(id);
      return;
    }
    feedback.tap();
    setMessage(null);
    selectTarget(id);
  };

  const suggestions = useMemo(
    () =>
      mode === "complete" && target
        ? suggest(text, index, { minChars: settings.autocompleteMinChars, limit: 5 })
        : [],
    [mode, target, text, index, settings.autocompleteMinChars],
  );

  const chips = (
    <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
      {[{ id: null as string | null, name: "Ganze Stadt" }, ...data.levels.districts].map((d) => (
        <button
          key={d.id ?? "all"}
          onClick={() => chooseDistrict(d.id)}
          className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold ${
            district === d.id ? "bg-sign text-white" : "bg-black/5 dark:bg-white/10"
          }`}
        >
          {d.name}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <GameShell
        back={href({ name: "home" })}
        title={
          <span className="inline-flex rounded-lg bg-black/5 p-0.5 text-[13px] dark:bg-white/10">
            {(["explore", "complete"] as CityMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 font-semibold ${mode === m ? "bg-[var(--surface-solid)] shadow" : "text-[var(--muted)]"}`}
              >
                {m === "explore" ? "Erkunden" : "Vervollständigen"}
              </button>
            ))}
          </span>
        }
        right={
          <button
            onClick={() => setOverview(true)}
            className="pr-2 text-right tabular-nums"
            aria-label="Stand pro Bezirk"
          >
            <span className="block text-[15px] font-semibold">
              {fmt(foundCount)}/{fmt(scopeIds.length)}
            </span>
            <span className="block text-[11px] text-[var(--muted)] underline underline-offset-2">
              Stand
            </span>
          </button>
        }
        headerExtra={chips}
        progress={scopeIds.length ? foundCount / scopeIds.length : 0}
        bottomInset={keyboard}
        map={
          <MapView
            data={data}
            streetIds={scopeIds}
            status={status}
            baseStatus="muted"
            area={initial.view}
            focus={view}
            outline={outline}
            markers={markers}
            onTap={onTap}
            onMoveEnd={(c, b) => {
              center.current = c;
              visible.current = b;
            }}
            padding={PADDING}
            attribution={false}
            postcodeToggle={mode === "explore"}
            areas={plzAreas}
          />
        }
      >
        {mode === "explore" ? (
          <div>
            <p className="text-[15px] font-medium">
              {selected ? (
                <>
                  {name(selected.id)}
                  {showPlz && selectedCodes.length > 0 && (
                    <span className="ml-2 font-bold tabular-nums text-[#7c3aed]">
                      {selectedCodes.join(" / ")}
                    </span>
                  )}
                  {cityMap.found[selected.id] && (
                    <span className="ml-2 text-sm text-ok">✓ eingetragen</span>
                  )}
                </>
              ) : (
                `Tippe auf eine Straße, um ihren Namen${showPlz ? " und ihr PLZ-Gebiet" : ""} zu sehen.`
              )}
            </p>
            <p className="mt-2 text-[10px] text-[var(--muted)]">{data.meta.attribution}</p>
          </div>
        ) : (
          <>
            {suggestions.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
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
                placeholder={
                  target ? "Name der markierten Straße …" : "Erst eine graue Straße antippen"
                }
                // Stays enabled so a tap on a street can focus it synchronously (iOS only opens the
                // keyboard for focus() inside the user gesture); without a street it refuses focus.
                onFocus={() => {
                  if (!targetRef.current) {
                    inputRef.current?.blur();
                    setMessage({
                      tone: "info",
                      text: "Tippe zuerst eine graue Straße auf der Karte an.",
                    });
                  }
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="done"
                className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] px-3.5 py-3 text-[16px] outline-none focus:border-brand disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!target}
                className="rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-40"
              >
                OK
              </button>
            </form>
            <div className="mt-2 flex min-h-6 items-center justify-between gap-3 text-sm">
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
              <span className="flex shrink-0 gap-3">
                <button onClick={hint} className="font-medium text-brand">
                  Tipp
                </button>
                <button
                  onClick={reset}
                  className="text-[var(--muted)] underline underline-offset-2"
                >
                  Reset
                </button>
              </span>
            </div>
          </>
        )}
      </GameShell>

      {overview && (
        <div
          className="fixed inset-0 z-10 flex items-end bg-black/40"
          onClick={() => setOverview(false)}
        >
          <div
            className="animate-pop mx-auto w-full max-w-xl rounded-t-3xl bg-[var(--surface-solid)] p-4 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-bold">Stand der Stadtkarte</h2>
            {[
              { id: null as string | null, name: "Ganze Stadt", ids: allIds },
              ...data.levels.districts.map((d) => ({
                id: d.id,
                name: d.name,
                ids: byDistrict.get(d.id) ?? [],
              })),
            ].map((d) => {
              const f = foundIn(d.ids);
              return (
                <button
                  key={d.id ?? "all"}
                  onClick={() => chooseDistrict(d.id)}
                  className="block w-full py-2 text-left"
                >
                  <span className="flex justify-between text-sm">
                    <span className={d.id === null ? "font-bold" : "font-medium"}>{d.name}</span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {fmt(f)}/{fmt(d.ids.length)}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
                    <span
                      className="block h-full rounded-full bg-ok"
                      style={{ width: `${d.ids.length ? (100 * f) / d.ids.length : 0}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
