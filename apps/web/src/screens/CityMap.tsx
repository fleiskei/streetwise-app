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
import type { CityData } from "../lib/cityData";
import { addFound, addHint, resetCityMap, useCityMap } from "../lib/cityMap";
import { feedback } from "../lib/feedback";
import { streetsBBox } from "../lib/geo";
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
      if (e) return { district: e.district.id, view: e.level.bounds };
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

  const foundIn = (ids: string[]) => ids.reduce((n, id) => n + (cityMap.found[id] ? 1 : 0), 0);
  const foundCount = foundIn(scopeIds);

  const status = useMemo(() => {
    const s: Record<string, StreetStatus> = {};
    for (const id of Object.keys(cityMap.found)) s[id] = "correct";
    if (mode === "complete") for (const id of cityMap.hinted) s[id] = "active";
    if (mode === "explore" && selected) s[selected.id] = "active";
    return s;
  }, [cityMap, mode, selected]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (mode === "explore" && selected)
      m.push({ key: "sel", at: selected.at, text: name(selected.id), variant: "sign" });
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
      for (const id of cityMap.hinted) {
        const p = data.streetsById.get(id)!.properties;
        m.push({
          key: `hint-${id}`,
          at: p.center,
          text: `${p.name.slice(0, 3)}…`,
          variant: "note",
        });
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, shown, cityMap, data]);

  const setMode = (m: CityMode) => {
    setMessage(null);
    setSelected(null);
    // Same component instance (key="city" in App): camera and filter stay as they are.
    window.location.replace(href({ name: "city", mode: m, focus }));
  };

  const chooseDistrict = (id: string | null) => {
    setDistrict(id);
    setOverview(false);
    const d = id ? data.levels.districts.find((x) => x.id === id) : undefined;
    setView(d ? d.bounds : data.meta.bounds);
  };

  const flyToIfHidden = (ids: string[]) => {
    const [w, s, e, n] = visible.current;
    const inView = ids.some((id) => {
      const [x, y] = data.streetsById.get(id)!.properties.center;
      return x > w && x < e && y > s && y < n;
    });
    if (!inView)
      setView(
        streetsBBox(
          ids.map((id) => data.streetsById.get(id)!),
          500,
        ),
      );
  };

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const hits = scopeIds.filter((id) => matchesName(v, name(id)));
    const fresh = hits.filter((id) => !cityMap.found[id]);
    if (fresh.length) {
      const counted = addFound(fresh);
      recordAnswers(
        counted.map((id) => ({ streetId: id, mode: "complete" as const, correct: true })),
      );
      feedback.correct();
      setShown(fresh[0]!);
      flyToIfHidden(fresh);
      setMessage({
        tone: "ok",
        text: `${name(fresh[0]!)} ✓${fresh.length > 1 ? ` (${fresh.length}×)` : ""}`,
      });
    } else if (hits.length) {
      setMessage({ tone: "info", text: "Schon eingetragen." });
    } else if (cityNorms.has(normalizeName(v))) {
      feedback.wrong();
      setMessage({
        tone: "bad",
        text: districtObj ? `Liegt nicht in ${districtObj.name}.` : "Nicht in den Kartendaten.",
      });
    } else {
      feedback.wrong();
      setMessage({ tone: "bad", text: "Unbekannter Straßenname." });
    }
    setText("");
    inputRef.current?.focus();
  };

  const hint = () => {
    const open = scopeIds.filter((id) => !cityMap.found[id] && !cityMap.hinted.includes(id));
    if (!open.length) return;
    let best = open[0]!;
    let bestD = Infinity;
    for (const id of open) {
      const d = haversine(center.current, data.streetsById.get(id)!.properties.center);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    addHint(best);
    setView(streetsBBox([data.streetsById.get(best)!], 600));
    setMessage({
      tone: "info",
      text: `Tipp: beginnt mit „${name(best).slice(0, 3)}…“ (zählt nicht für den Lernstand)`,
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
    setMessage({ tone: "info", text: "Stadtkarte zurückgesetzt." });
  };

  const onTap = (tap: MapTap) => {
    if (mode === "explore")
      setSelected(tap.street ? { id: tap.street.properties.id, at: tap.at } : null);
    else if (tap.street && cityMap.found[tap.street.properties.id])
      setShown(tap.street.properties.id);
  };

  const suggestions = useMemo(
    () =>
      mode === "complete"
        ? suggest(text, index, { minChars: settings.autocompleteMinChars, limit: 5 })
        : [],
    [mode, text, index, settings.autocompleteMinChars],
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
          />
        }
      >
        {mode === "explore" ? (
          <div>
            <p className="text-[15px] font-medium">
              {selected ? (
                <>
                  {name(selected.id)}
                  {cityMap.found[selected.id] && (
                    <span className="ml-2 text-sm text-ok">✓ eingetragen</span>
                  )}
                </>
              ) : (
                "Tippe auf eine Straße, um ihren Namen zu sehen."
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
                  districtObj ? `Straße in ${districtObj.name} …` : "Straßenname eingeben …"
                }
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
