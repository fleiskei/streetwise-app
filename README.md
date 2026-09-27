# Streetwise

Interaktives Quiz zum Lernen der Straßennamen deiner Stadt (zuerst: Aachen).
Die Karte zeigt keine Beschriftung, die Namen kommen von dir: per Multiple Choice, per Zuordnung
oder im schweren Modus, in dem du die Karte durch Eintippen der Namen vervollständigst.

- Web-App / PWA (iOS), gehostet auf Cloudflare Pages (`streetwise.pages.dev`)
- Fortschritt mit Spaced Repetition + Levels, serverseitig gespeichert (Login über Cloudflare Access)

## Dokumentation
- [Anforderungen](docs/REQUIREMENTS.md)
- [Umsetzungsplan](docs/PLAN.md)
- [Einrichtung Cloudflare & GitHub](docs/SETUP.md)

## Aufbau

```
apps/web/            React-App (Vite, Tailwind, MapLibre, PWA) + Pages Functions unter functions/api
packages/core/       Spiellogik ohne Framework: Normalisierung, Autocomplete, Leitner, Levels, Geo
tools/data/          Datenpipeline OSM/Overpass → apps/web/public/data/<stadt>/
tools/tiles/         Kartenkacheln ohne Beschriftung (Protomaps) → apps/web/public/tiles/<stadt>/
cities/aachen.json   Stadt-Konfiguration
```

## Entwicklung

Voraussetzungen: Node 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev            # App auf http://localhost:5173
pnpm check          # Format, Lint, Typecheck, Tests
pnpm build          # Produktions-Build nach apps/web/dist
```

API lokal (Pages Functions): `cp apps/web/.dev.vars.example apps/web/.dev.vars`, dann
`pnpm build && pnpm --filter @streetwise/web dev:api` (Port 8788; `pnpm dev` leitet `/api` dorthin weiter).

## Stadtdaten erzeugen

```bash
pnpm data:aachen    # Straßen & Plätze aus OpenStreetMap (Overpass), Levels, Namensliste
pnpm tiles:aachen   # Kartenkacheln ohne Beschriftung für die Stadt (Protomaps-Build)
```

Die Ergebnisse werden committet. Alternativ läuft beides in GitHub Actions:
**Actions → „Build city data“ → Run workflow** (committet auf den gewählten Branch; manuell startbar,
sobald der Workflow auf `main` liegt). Außerdem läuft er bei jedem Push, der `cities/**` ändert.
Ohne Kacheln zeigt die App die Straßen selbst als Grundkarte.

Kartendaten © OpenStreetMap-Mitwirkende (ODbL), Kacheln: Protomaps, Luftbild: © Geobasis NRW (dl-de/zero-2.0).
