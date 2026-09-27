# Streetwise – Umsetzungsplan

Stand: 2026-09-27 · Status: **freigegeben, M0–M4 fertig** · Anforderungen: [REQUIREMENTS.md](REQUIREMENTS.md)

## 1. Architektur

```
                ┌──────────────────────── Cloudflare ────────────────────────┐
 iPhone (PWA)   │  Pages: statische App (Vite-Build)                         │
 ┌───────────┐  │   ├─ /            React-App + Service Worker                │
 │ React     │──┼──▶├─ /data/aachen/*.json   Straßen, Levels, Namensliste    │
 │ MapLibre  │  │   └─ /tiles/aachen/{z}/{x}/{y}.mvt  label-freie Vektor-Tiles│
 │ IndexedDB │  │                                                             │
 │ SW-Cache  │──┼──▶ Pages Functions (Hono) /api/*  ──▶  D1 (SQLite)         │
 └───────────┘  │   ▲ geschützt durch Cloudflare Access (One-time PIN)       │
                │   URL vorerst: https://streetwise.pages.dev                 │
                └─────────────────────────────────────────────────────────────┘
        Build-Zeit (GitHub Actions / lokal): OSM → Pipeline → GeoJSON + Tiles
```

- **Daten und Tiles sind statisch.** Sie entstehen einmal in der Pipeline und werden mit der App ausgeliefert.
  Zur Laufzeit gibt es keine Abhängigkeit von Overpass oder fremden Tile-Servern. Deshalb geht Offline gut, und es fallen keine Kosten an.
- **Die Functions machen nur Identität und Fortschritt.** Die Anmeldung selbst übernimmt Cloudflare Access.
  App und API laufen auf **derselben Origin**, dadurch gibt es keine CORS- und keine Third-Party-Cookie-Probleme auf iOS. Die Spiellogik läuft komplett im Client, damit sie offline funktioniert.

## 2. Repo-Struktur (pnpm-Monorepo)

```
apps/
  web/            Vite + React + TS + Tailwind, MapLibre GL, vite-plugin-pwa (Workbox)
  web/functions/  Pages Functions (Hono) unter /api/*, D1-Migrationen in apps/web/migrations
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

## 5. Backend (`apps/web/functions`)

**Hono als Pages Functions, D1, Identität über Cloudflare Access.** Jeder Request an `/api/*` bringt `Cf-Access-Jwt-Assertion` mit.
Der JWT wird gegen `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` geprüft (Audience-Tag als Env-Variable).
Die E-Mail aus dem Token bestimmt den Nutzer. Eigene Sessions und Login-Codes gibt es damit nicht.

### Datenmodell (D1)
Siehe `apps/web/migrations/0001_init.sql`:
```sql
users         (id TEXT PK, email TEXT UNIQUE, created_at)
answers       (id TEXT PK /*Client-UUID*/, user_id, city, street_id, mode, correct, at)   -- Ereignislog, idempotent
city_map      (user_id, city, street_id, found_at, hinted, hint_at, PK(user_id, city, street_id))
city_map_meta (user_id, city, reset_at, PK(user_id, city))
settings      (user_id PK, value JSON, updated_at)                                        -- last-writer-wins
```
Der Lernstand wird nicht gespeichert, sondern bei jedem Sync aus `answers` berechnet (`replay`), auf dem Server und
auf dem Gerät mit derselben Logik aus `packages/core`.

### API
| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/auth/login` | Navigationsziel zum Anmelden: Access erzwingt den Login, danach Redirect zurück zur App |
| GET | `/cdn-cgi/access/logout` | Abmelden (stellt Access bereit) |
| GET | `/api/me` | angemeldeter Nutzer |
| POST | `/api/sync` | `{city, answers[], cityMap, settings}` → `{progress, cityMap, settings, accepted[]}` |
| GET | `/api/export` · DELETE `/api/me` | Datenexport / Konto samt Serverdaten löschen |

### Sync-Strategie
- Der Client rechnet SR und Level **optimistisch lokal** mit `packages/core` und legt die Antworten in eine Warteschlange (localStorage, `pending`).
- Der Server nutzt **dieselbe** `core`-Logik. Er übernimmt die Antworten (nach Zeitpunkt sortiert), berechnet `progress` neu und schickt das Ergebnis zurück.
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
| M0 | Grundgerüst | Monorepo, Lint/Format/Test, CI, leere App + `/api/me` auf `streetwise.pages.dev`, Access auf `/api/*`, **Login-Test auf dem iPhone als PWA** | S |
| M1 | Daten & Karte | Pipeline für Aachen, label-freie Tiles, eigener Style, Straßen-Layer sichtbar, Bezirkswahl | L |
| M2 | Spielmodi | M1–M4 lokal spielbar inkl. Autocomplete, Rundenergebnis, Sound/Haptik | L |
| M3 | Lernlogik | Leitner, Levels, Freischaltung, Sterne, „Wiederholen“, lokal persistiert | M |
| M4 | Backend & Sync | D1-Schema, Access-JWT-Prüfung, Answers-Sync, Übernahme anonymer Daten | M |
| M5 | PWA & Offline | Installierbar auf iOS, Offline-Download pro Bezirk, Offline-Queue | M |
| M6 | Statistik & Politur | Dashboard, Fortschrittskarte, Animationen, A11y-Pass, E2E-Tests | M |
| M7 | Go-Live | Produktions-Deploy über GitHub Actions, Doku (eigene Domain optional später) | S |

\* S ≈ ½ Tag, M ≈ 1–2 Tage, L ≈ 2–4 Tage Implementierungsarbeit

**Stand 2026-09-27**
- ✅ M0: Monorepo, CI, Deploy nach Cloudflare Pages, `/api/me` mit Access-JWT-Prüfung, Konto-Screen.
  Login per Cloudflare Access funktioniert in der iOS-PWA (vom Home-Bildschirm gestartet) – kein Fallback nötig.
- ✅ M1: Datenpipeline (1.515 Straßen/Plätze, 7 Bezirke, Levels wachsen vom Zentrum aus), label-freie Kacheln,
  Bezirke → Level-Pfad → Karte „Erkunden“ (Straße antippen zeigt den Namen).
- ✅ M2: Level-Seite mit Moduswahl; Multiple Choice, Zuordnen (Tap-Tap, beide Richtungen), Antippen
  (Toleranz zoomabhängig, Abstand bei Fehlern), Karte vervollständigen (Autocomplete aus allen Namen der
  Stadt, Timer, Aufgeben); Rundenauswertung mit „Fehler üben“; Sound und Haptik (iOS-18-Switch-Trick),
  Einstellungen im Konto-Screen.
- ✅ M3: Antworten lokal gespeichert (Leitner), Levels schalten frei, Sterne inkl. ★★★; „Wiederholen“ über alle
  Levels (bis 15 fällige Straßen, schwache als Multiple Choice, sichere zum Antippen); Startseite mit
  „Wiederholen“ (Anzahl fällig) und „Weiterlernen“ (nächstes offenes Level im zuletzt gespielten Bezirk).
- ✅ M4: Sync über `POST /api/sync` (Antworten als Log mit Client-UUIDs, Fortschritt = Replay; Stadtkarte per
  `mergeCityMap`, Reset gewinnt geräteübergreifend; Einstellungen last-writer-wins). Upload wenige Sekunden nach
  Änderungen, beim Start, bei Rückkehr online und beim Wechsel in den Hintergrund. Anonyme Nutzung bleibt möglich,
  der lokale Stand wird beim ersten Login hochgeladen. Export (`GET /api/export`) und Kontolöschung (`DELETE /api/me`).
  D1 `streetwise` (Migrationen in `apps/web/migrations`, angewendet im Deploy-Workflow).

Nach M2 gibt es eine **spielbare Demo** ohne Login. Ich schlage vor, sie dort einmal auf dem iPhone zu testen,
bevor Backend und Offline dazukommen.

## 7a. Erweiterungen nach Test-Feedback (2026-09-27)

Reihenfolge: **E1 → E2 → E3 → M4**. E2 kommt vor M4, damit das Datenmodell für den Sync feststeht.

| # | Erweiterung | Ergebnis | Aufwand |
|---|---|---|---|
| E1 ✅ | **Weiter rauszoomen** | Die Pan- und Zoomgrenze ist das Stadtgebiet plus Rand statt Level plus Rand. Die Level-Ansicht bleibt als Startausschnitt. | S |
| E2 ✅ | **Stadtkarte** (Erkunden und Vervollständigen ohne Level) | siehe unten | L |
| E3 ✅ | **Satellitenbild** | Umschalter Karte/Luftbild. Quelle sind die NRW-Luftbilder (DOP, Geobasis NRW, Lizenz dl-de/zero-2.0), nur online. Straßen-Overlay und Schilder bleiben. Umgesetzt: WMTS `wmts_nw_dop`, Matrix-Set `EPSG_3857_16` (Matrix = Zoom − 5), CORS erlaubt, kein Proxy nötig; Quelle in `cities/aachen.json` (`aerial`). | M |

### E2 Stadtkarte
- **Ein durchgehender Stand für die ganze Stadt**, frei zoombar. Einstieg über eine eigene Karte auf der Startseite
  („Stadtkarte“) mit den Modi *Erkunden* und *Vervollständigen*.
- **Bezirksfilter** (Chips): zoomt auf den Bezirk, dimmt den Rest ab und zeigt den Zähler des Bezirks. Ohne Filter gilt
  der Zähler für die ganze Stadt („x von 1.516“), dazu ein Blatt mit dem Stand pro Bezirk.
- **Vervollständigen:** Graue Straße antippen, Namen eingeben (Autocomplete aus allen Namen der Stadt). Richtig →
  grün; die nächste Straße wählt man selbst per Antippen. Der **Stand bleibt gespeichert**, bis man
  ihn mit **Reset** (mit Bestätigung) zurücksetzt. *(Nach Test-Feedback geändert: vorher wurden beliebige Namen
  eingetippt.)*
- **Tipp statt Aufgeben:** Der Tipp markiert eine noch fehlende Straße nahe der Kartenmitte und zeigt die ersten
  Buchstaben. Wird diese Straße danach eingetragen, zählt sie nicht als richtig für den Lernstand.
- **Lernstand:** Jede neu eingetragene Straße zählt als richtige Antwort im Modus „vervollständigen“ (+2 Boxen).
  Reset löscht nur die Karte, nicht den Lernstand.
- **Level-Seite:** „Erkunden“ und „Vervollständigen“ öffnen die Stadtkarte auf den Ausschnitt des Levels. ★★★ bekommt
  ein Level, wenn alle seine Straßen in der Stadtkarte ohne Tipp gefunden wurden.
- **Datenmodell** (lokal, in M4 synchronisiert): `cityMap: { found: Record<streetId, { at, hinted }> }`.

## 7b. E4: Postleitzahlen (umgesetzt, 2026-09-27)

Ziel: die **PLZ-Gebiete** kennen. Einstieg ist die Spielform **Straße → PLZ (Auswahl)**; nach jeder Antwort wird das
richtige Gebiet eingeblendet. „PLZ → Gebiet antippen“ folgt in einem zweiten Schritt (E4b).

| # | Schritt | Ergebnis | Aufwand |
|---|---|---|---|
| E4.0 ✅ | Datenprüfung | **Ergebnis (OSM-Stand 2026-09-27):** 10 PLZ-Gebiete (52062–52080) mit Grenzen (`boundary=postal_code`). Sie decken das Stadtgebiet **zu 100 %** ab, ohne Überlappung. 19.997 von 20.000 Adressen (`addr:postcode`) liegen im Gebiet ihrer PLZ. Anteile an der Stadtfläche: 52076 34 %, 52074 20 %, 52072 12 %, 52080 9 %, 52078 8 %, 52070 6 %, 52066 5 %, 52068 3 %, 52064 1 %, 52062 1 %. → Die Grenzen sind die Quelle, ein Fallback ist nicht nötig. | S |
| E4.1 ✅ | Pipeline | `postcodes.geojson` (Code, vereinfachte Fläche, Beschriftungspunkt). Jede Straße bekommt `postcodes: string[]`, bestimmt über den Längenanteil in den Gebieten (≥ 5 %), sortiert nach Anteil. Plausibilitätsbericht: Straßen ohne PLZ, Straßen mit mehreren PLZ. | M |
| E4.2 ✅ | Lernlogik | Eigener Wissensstand pro Straße unter dem Schlüssel `plz:<streetId>` mit derselben Leitner-Logik und neuem Modus `postcode` (+½ Box wie Multiple Choice). Antworten laufen über denselben Sync, **ohne Schemaänderung**. Levels werden weiter nur über die Namen freigeschaltet. | S |
| E4.3 ✅ | Modus „PLZ zuordnen“ | Die Straße ist markiert, dazu 4 PLZ. Die falschen Antworten kommen aus benachbarten Gebieten, nie eine PLZ, in der die Straße liegt. **Jede PLZ, in der die Straße liegt, zählt als richtig.** Danach werden Gebietsgrenze und PLZ eingeblendet. | M |
| E4.4 ✅ | Einbindung | Level-Seite: Karte „PLZ zuordnen“ und ein zweiter Balken „PLZ gemeistert“. „Wiederholen“ fragt fällige PLZ mit ab. | S |
| E4.5 ✅ | Anzeige | Umschalter „PLZ“ neben dem Luftbild-Schalter (Stadtkarte/Erkunden): Gebietsgrenzen und große PLZ-Beschriftungen, die Einstellung wird gespeichert. | S |

Quelle: OSM-Grenzen `boundary=postal_code` (ODbL, wie die Straßen); laut E4.0 vollständig und konsistent.
Hinweis: Die Innenstadt-PLZ (52062, 52064) sind flächenmäßig klein, dort liegen aber viele Straßen.

## 8. Tests & Qualität
- Vitest für `packages/core` (Normalisierung, Autocomplete-Ranking, Leitner, Level-Freischaltung, Distraktoren, Treffer-Distanz)
- Functions-Tests mit `@cloudflare/vitest-pool-workers` (JWT-Prüfung, idempotente Answers)
- Playwright-Smoke-Test: App lädt, Karte rendert, eine M1-Runde lässt sich durchspielen
- GitHub Actions: lint → typecheck → test → build; Deploy auf `main` mit `wrangler pages deploy` (Direct Upload wie bei spltrainer),
  Preview-Deploys für Branches. D1-Migrationen laufen im Workflow mit `wrangler d1 migrations apply --remote`.

## 9. Einrichtung durch dich (einmalig)

Schritt-für-Schritt-Anleitung: [SETUP.md](SETUP.md).

Hosting und Login laufen wie bei spltrainer unter `*.pages.dev` mit Cloudflare Access. Eine eigene Domain ist vorerst nicht nötig.

1. **Pages-Projekt** `streetwise` anlegen (Direct Upload, der Workflow deployt).
2. **D1-Datenbank** `streetwise` anlegen und im Pages-Projekt als Binding `DB` eintragen.
   Die IDs trage ich in `wrangler.toml` ein, sobald du sie mir nennst.
3. **Zero Trust → Access → Applications → Self-hosted**: Domain `streetwise.pages.dev`, **Pfad `api`**, Policy „Allow“ für
   deine E-Mail-Adresse(n), Identity „One-time PIN“, Session-Dauer z. B. 1 Monat. Das **Application Audience (AUD) Tag**
   und den Team-Namen brauche ich als Env-Variablen.
4. **GitHub-Secrets** `CLOUDFLARE_API_TOKEN` (Rechte: Pages Edit, D1 Edit) und `CLOUDFLARE_ACCOUNT_ID`.
   Falls du bei spltrainer schon ein Token hast, kannst du es um die D1-Rechte erweitern.

**Fallback**, falls der Access-Login in der iOS-PWA nicht funktioniert (siehe REQUIREMENTS 5.1): eigener Login mit
6-stelligem Code, der direkt in der PWA eingegeben wird. Der Versand läuft über Resend. Dafür ist eine eigene Domain nötig.
