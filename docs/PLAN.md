# maptrain – Umsetzungsplan

Stand: 2026-09-23 · Status: **Entwurf, wartet auf Freigabe** · Anforderungen: [REQUIREMENTS.md](REQUIREMENTS.md)

## 1. Architektur

```
                ┌──────────────────────── Cloudflare ────────────────────────┐
 iPhone (PWA)   │  Pages: statische App (Vite-Build)                         │
 ┌───────────┐  │   ├─ /            React-App + Service Worker                │
 │ React     │──┼──▶├─ /data/aachen/*.json   Straßen, Levels, Namensliste    │
 │ MapLibre  │  │   └─ /tiles/aachen/{z}/{x}/{y}.mvt  label-freie Vektor-Tiles│
 │ IndexedDB │  │                                                             │
 │ SW-Cache  │──┼──▶ Worker (Hono) /api/*  ──▶  D1 (SQLite)                   │
 └───────────┘  │                         └──▶ Resend (Magic-Link-Mails)      │
                └─────────────────────────────────────────────────────────────┘
        Build-Zeit (GitHub Actions / lokal): OSM → Pipeline → GeoJSON + Tiles
```

- **Daten und Tiles sind statisch.** Sie entstehen einmal in der Pipeline und werden mit der App ausgeliefert.
  Zur Laufzeit gibt es keine Abhängigkeit von Overpass oder fremden Tile-Servern. Deshalb geht Offline gut, und es fallen keine Kosten an.
- **Der Worker macht nur Auth und Fortschritt.** Die Spiellogik läuft komplett im Client, damit sie offline funktioniert.

## 2. Repo-Struktur (pnpm-Monorepo)

```
apps/
  web/            Vite + React + TS + Tailwind, MapLibre GL, vite-plugin-pwa (Workbox)
  api/            Cloudflare Worker (Hono), D1-Migrationen, wrangler.toml
packages/
  core/           Framework-freie Logik: Normalisierung, Autocomplete, SR/Leitner,
                  Level-Freischaltung, Distraktor-Auswahl, Treffer-Distanz (mit Tests)
  shared/         Gemeinsame Typen + zod-Schemas für die API
tools/
  data/           Datenpipeline (Node/TS): Overpass → Straßeneinheiten → Levels
  tiles/          Tile-Build: Protomaps-Extract → label-freie MVT-Tiles
cities/
  aachen.json     Stadt-Config (OSM-Relation, Bezirke, Zoomstufen, Farben)
docs/             Anforderungen, Plan, Architektur-Entscheidungen (ADR)
```

## 3. Datenpipeline (`tools/data`)

1. **Grenzen laden:** Stadtgrenze Aachen (`admin_level=8`) und Stadtbezirke (`admin_level=9`) über Overpass.
2. **Straßen laden:** `highway~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service)$"` + `name`,
   dazu `place=square` und benannte `highway=pedestrian`-Flächen.
   `service` nur mit Namen. Autobahnen und Rampen fliegen raus.
3. **Zusammenfassen:** Ways mit gleichem Namen werden über einen räumlichen Cluster zu einer *Straßeneinheit* gebündelt
   (verbunden oder < 150 m Abstand). Jede bekommt eine stabile ID (Hash aus Name + Schwerpunkt, gerundet),
   damit der Fortschritt eine Aktualisierung der Daten übersteht.
4. **Bezirk zuordnen:** nach Längenanteil.
5. **Wichtigkeit:** höchste highway-Klasse, Länge, Plätze bekommen einen Bonus.
6. **Levels bilden:** pro Bezirk nach Wichtigkeit in Stufen einteilen (Haupt-, Wohn-, Neben-/Wege) und jede Stufe
   räumlich clustern (k-means auf Schwerpunkte, Zielgröße 20). So entstehen Levels mit 15–25 Straßen, die räumlich
   zusammenhängen. Die Reihenfolge ist deterministisch (Seed).
7. **Ausgabe** je Stadt:
   - `streets.geojson`: Geometrien, vereinfacht (Douglas-Peucker ~2 m), Koordinaten auf 6 Nachkommastellen
   - `levels.json`: Bezirke → Levels → Straßen-IDs, BBoxen
   - `names.json`: alle Namen, normalisiert, für das Autocomplete
   - `meta.json`: Datenstand, Attribution, Version
8. Plausibilitätsbericht: Anzahl Straßen je Bezirk, doppelte Namen, sehr kurze Einheiten.

Die Daten werden **im Repo committet**, damit Builds reproduzierbar sind und Overpass nicht in CI laufen muss.
Aktualisieren geht mit `pnpm data:aachen`.

## 4. Karte & Tiles (`tools/tiles`)

- Quelle: **Protomaps Basemap** (`pmtiles extract` für die Aachen-BBox, z0–16).
- Die Tiles werden in einzelne `{z}/{x}/{y}.mvt` zerlegt. Für die Aachen-BBox sind das einige Tausend Dateien,
  also passend für Pages. Alternativ legen wir sie auf R2 mit Worker-Route.
  Einzeltiles lassen sich im Service Worker einfach cachen; bei PMTiles-Range-Requests ist das unter iOS unzuverlässig.
- **Eigener MapLibre-Style** ohne jeden `symbol`-Layer mit Text: ruhige Grundfarben, Straßenbreite nach Klasse,
  Gebäude dezent, Wasser und Grün. Dazu eine Hell- und eine Dunkel-Variante.
- Glyphs werden nur für die eingeblendeten Antwort-Labels gebraucht. Dafür hosten wir eine Schrift (Inter/Noto Sans) selbst, als Latin-Subset.
- Spiel-Layer kommen als GeoJSON-Source aus `streets.geojson`, gestylt über `feature-state` (Status-Farben, Hover, Pulsieren).
- Treffer-Erkennung in M3: Abstand vom Tap zur Linie mit `@turf/point-to-line-distance`. Die Toleranz richtet sich nach dem Zoom
  (mindestens 25 m bzw. 22 px). Bei Plätzen zählt „Punkt im Polygon“ oder ein Abstand ≤ 15 m.

## 5. Backend (`apps/api`)

**Hono auf Workers, D1, Session-Cookie (HttpOnly, SameSite=Lax) und zusätzlich Bearer-Token für die PWA.**

### Datenmodell (D1)
```sql
users        (id TEXT PK, email TEXT UNIQUE, created_at, settings_json)
login_codes  (email, code_hash, link_token_hash, expires_at, attempts)   -- 10 min gültig, max 5 Versuche
sessions     (id TEXT PK, user_id, created_at, expires_at, user_agent)   -- 90 Tage, rollierend
answers      (id TEXT PK /*Client-UUID*/, user_id, city, street_id, mode,
              correct INT, answered_at, response_ms)                      -- Ereignislog, idempotent
progress     (user_id, city, street_id, box REAL, due_at, n_correct, n_wrong, last_at,
              PRIMARY KEY (user_id, city, street_id))                      -- materialisierter Zustand
level_state  (user_id, city, level_id, stars, unlocked_at, PRIMARY KEY (...))
```

### API
| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/auth/request` | E-Mail → Code + Link verschicken (Rate-Limit pro E-Mail und IP) |
| POST | `/api/auth/verify` | Code oder Link-Token → Session |
| POST | `/api/auth/logout` | |
| GET | `/api/me` | Nutzer + Einstellungen |
| GET | `/api/progress?city=aachen&since=` | Fortschritt (Delta-Sync) |
| POST | `/api/answers` | Batch von Antworten (idempotent über Client-UUID) → aktualisierter Fortschritt |
| GET | `/api/stats?city=aachen` | Aggregationen für das Dashboard |
| GET | `/api/export` · DELETE `/api/me` | Datenexport / Kontolöschung |

### Sync-Strategie
- Der Client rechnet SR und Level **optimistisch lokal** mit `packages/core` und legt die Antworten in eine IndexedDB-Queue.
- Der Server nutzt **dieselbe** `core`-Logik. Er übernimmt die Antworten (nach `answered_at` sortiert), berechnet `progress` neu und schickt das Ergebnis zurück.
  Der Server hat damit das letzte Wort, und bei mehreren Geräten ist das Ergebnis deterministisch.
- Beim ersten Login werden die anonymen lokalen Antworten hochgeladen und übernommen.

## 6. Frontend (`apps/web`)

- **Screens:** Start (Stadt/Bezirk wählen, „Wiederholen“-Button mit Anzahl fälliger Straßen) → Bezirk (Level-Pfad
  mit Sternen und Sperrsymbol) → Moduswahl → Spiel → Rundenergebnis. Dazu Statistik, Einstellungen, Login.
- **UI:** Die Karte füllt den Screen. Die Steuerung liegt in einem Bottom-Sheet mit Glas-Effekt, das man mit dem Daumen erreicht.
  Dazu weiche Animationen (Framer Motion), große Touch-Ziele und Dark Mode. Komponentenbasis: Radix-Primitives + Tailwind.
- **State:** Zustand (Store) + TanStack Query für API, `idb-keyval`/Dexie für Offline-Queue und Fortschritt.
- **PWA:** `vite-plugin-pwa`, Manifest, Apple-Touch-Icons und Splash-Screens, `display: standalone`,
  `viewport-fit=cover`. Workbox: App-Shell precache. Tiles und Daten laufen über Runtime-Cache
  (CacheFirst); dazu kommt ein Button „Bezirk offline verfügbar machen“, der alle Tiles in der BBox des Bezirks (z12–16) vorab lädt.
- **Sound:** kleine Web-Audio-Samples. **Haptik:** `navigator.vibrate`, auf iOS der Switch-Fallback.

## 7. Meilensteine

| # | Meilenstein | Ergebnis | Aufwand* |
|---|---|---|---|
| M0 | Grundgerüst | Monorepo, Lint/Format/Test, CI, leere App auf Pages und Worker auf Workers deployed | S |
| M1 | Daten & Karte | Pipeline für Aachen, label-freie Tiles, eigener Style, Straßen-Layer sichtbar, Bezirkswahl | L |
| M2 | Spielmodi | M1–M4 lokal spielbar inkl. Autocomplete, Rundenergebnis, Sound/Haptik | L |
| M3 | Lernlogik | Leitner, Levels, Freischaltung, Sterne, „Wiederholen“, lokal persistiert | M |
| M4 | Backend & Sync | D1-Schema, Magic Link + Code (Resend), Answers-Sync, Übernahme anonymer Daten | M |
| M5 | PWA & Offline | Installierbar auf iOS, Offline-Download pro Bezirk, Offline-Queue | M |
| M6 | Statistik & Politur | Dashboard, Fortschrittskarte, Animationen, A11y-Pass, E2E-Tests | M |
| M7 | Go-Live | Custom Domain, Produktions-Deploy über GitHub Actions, Doku | S |

\* S ≈ ½ Tag, M ≈ 1–2 Tage, L ≈ 2–4 Tage Implementierungsarbeit

Nach M2 gibt es eine **spielbare Demo** ohne Login. Ich schlage vor, sie dort einmal auf dem iPhone zu testen,
bevor Backend und Offline dazukommen.

## 8. Tests & Qualität
- Vitest für `packages/core` (Normalisierung, Autocomplete-Ranking, Leitner, Level-Freischaltung, Distraktoren, Treffer-Distanz)
- Worker-Tests mit `@cloudflare/vitest-pool-workers` (Auth-Flow, idempotente Answers)
- Playwright-Smoke-Test: App lädt, Karte rendert, eine M1-Runde lässt sich durchspielen
- GitHub Actions: lint → typecheck → test → build; Deploy auf `main`

## 9. Offene Punkte (von dir zu klären)
1. **Domain:** Resend braucht eine verifizierte Absender-Domain, und schöner ist sie auch als App-URL.
   Hast du eine Domain (bei Cloudflare)? Sonst `*.pages.dev` für die App und vorerst eine Resend-Testdomain
   (die nur an die eigene Adresse senden kann).
2. **Cloudflare-Zugang für CI:** Für automatische Deploys brauchen wir `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`
   als GitHub-Secrets sowie `RESEND_API_KEY` als Worker-Secret. Die richtest du selbst ein, ich dokumentiere die Schritte.
3. **Freigabe** dieses Plans bzw. Änderungswünsche. Danach beginne ich mit M0 + M1.
