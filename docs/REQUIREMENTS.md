# Streetwise – Anforderungen

Stand: 2026-09-23 · Status: **Entwurf, wartet auf Freigabe**

Streetwise ist eine Web-App (PWA), mit der man die Straßennamen einer Stadt lernt. Sie zeigt eine Karte
ohne Beschriftung, und der Nutzer muss die Namen selbst zuordnen. Erste Stadt ist **Aachen**.

## 1. Entscheidungen aus der Anforderungsrunde

| Thema | Entscheidung |
|---|---|
| Repository | `fleiskei/streetwise-app`, App-Name „Streetwise“ |
| Gebiet | Aachen, getrennt nach **Stadtbezirken** wählbar (Mitte, Brand, Eilendorf, Haaren, Kornelimünster/Walheim, Laurensberg, Richterich) |
| Inhalte | **Straßen und Plätze** mit Namen (OSM) |
| Nutzer | Ich bzw. ein kleiner Kreis, keine öffentliche Bestenliste |
| Login | E-Mail-Einmalcode über **Cloudflare Access (One-time PIN)**, wie bei spltrainer; keine eigene Domain und kein Mail-Dienst nötig (siehe 5.1) |
| Lernlogik | **Spaced Repetition + Level-System** (Levels sollen motivieren) |
| Texteingabe | **Autocomplete** |
| Karte | **Vektor-Tiles mit eigenem Stil** ohne Labels (MapLibre GL) |
| Name → Straße | Treffer, wenn der Tap **im Umkreis** der Straßengeometrie liegt (~25 m, zoomabhängig) |
| Offline | **Ja**, Download pro Bezirk; Antworten werden gesammelt und später synchronisiert |
| Stack | Vite + React + TS + Tailwind, MapLibre, Cloudflare Pages + Pages Functions (Hono) + D1 |
| Hosting/URL | Vorerst **`*.pages.dev`** (keine eigene Domain), Deploy per GitHub Actions wie bei spltrainer |
| Extras | Statistik-Dashboard, Haptik & Sound, stadtunabhängige Architektur |

## 2. Funktionale Anforderungen

### 2.1 Karte
- F-1 Die Karte zeigt Straßen, Gebäude, Wasser, Grünflächen und Bahnlinien, aber **keine Texte**
  (keine Straßen-, Orts-, POI-Namen und keine Hausnummern).
- F-2 Die Karte ist auf den gewählten Bezirk/das Level beschränkt (maxBounds). Alles außerhalb wird abgedunkelt.
- F-3 Die abgefragten Straßen werden als eigener Layer hervorgehoben. Farbe zeigt den Status:
  offen / aktuell gefragt / richtig / falsch / gemeistert.
- F-4 Nach einer Antwort erscheint der richtige Name kurz als Label an der Straße.
- F-5 Hell- und Dunkelmodus folgen der Systemeinstellung.
- F-6 Die OSM-Attribution (ODbL) wird angezeigt.

### 2.2 Spielmodi
Jeder Modus läuft auf einem **Level** (oder frei auf einem ganzen Bezirk).

| # | Modus | Ablauf | Schwierigkeit |
|---|---|---|---|
| M1 | **Multiple Choice** | Eine Straße ist markiert, dazu gibt es 4 Namen. Die falschen Antworten kommen bevorzugt aus der Nähe und vom gleichen Straßentyp. | leicht |
| M2 | **Zuordnung Straße → Name** | 4–6 Straßen sind nummeriert markiert. Die Namen stehen als Chips darunter und werden per Tap-Tap oder Drag den Straßen zugeordnet. | mittel |
| M3 | **Zuordnung Name → Straße** | Ein Name wird angezeigt, der Nutzer tippt die Straße auf der Karte an. Bei einem Fehler wird die richtige Straße samt Abstand gezeigt. | mittel |
| M4 | **Karte vervollständigen** (schwer) | Alle Straßen des Gebiets sind grau. Der Nutzer tippt beliebige Namen ein; jeder richtige färbt „seine“ Straße ein. Fertig ist die Runde, wenn die Karte vollständig ist oder der Nutzer aufgibt. | schwer |

- F-7 **Autocomplete in M4:** Vorgeschlagen werden Namen aus der **ganzen Stadt**, nicht nur aus dem
  aktuellen Gebiet. Die Liste verrät also nicht, welche Straßen gefragt sind. Vorschläge kommen erst ab
  3 Zeichen (einstellbar: 2/3/4/aus). Außerdem egal: Groß-/Kleinschreibung, ß/ss, „Str.“/„Straße“, Bindestriche.
- F-8 M4 zeigt einen Fortschrittsbalken (x von n) und einen Timer. Wer aufgibt, bekommt die restlichen
  Straßen angezeigt; sie zählen als „falsch“.
- F-9 Nach jeder Runde gibt es eine Zusammenfassung: Trefferquote, neu gemeisterte Straßen,
  Level-Fortschritt, und die Fehler können direkt wiederholt werden.

### 2.3 Lernlogik: Spaced Repetition + Levels
- F-10 Für jede Straße speichert die App pro Nutzer einen Wissensstand nach dem **Leitner-System**:
  Box 0–5 mit den Intervallen 0 / 1 / 3 / 7 / 16 / 35 Tage.
- F-11 Richtige Antworten heben die Box an, und zwar nach Modus unterschiedlich stark: M1 zählt +½
  (zwei Treffer ergeben eine Box), M2 und M3 zählen +1, M4 zählt +2. Bei einer falschen Antwort fällt die Straße auf Box 1 zurück.
- F-12 **Gemeistert** ist eine Straße ab Box ≥ 3.
- F-13 **Levels:** Jeder Bezirk wird in Levels mit je ca. 15–25 Straßen aufgeteilt. Die Levels sind
  räumlich zusammenhängend und aufsteigend nach Wichtigkeit sortiert: erst Hauptstraßen und Plätze, dann Wohnstraßen, dann Wege.
- F-14 Das nächste Level wird frei, wenn im aktuellen **80 % gemeistert** sind. Level 1 jedes Bezirks ist sofort frei.
- F-15 **„Wiederholen“**: Diese Runde mischt die fälligen Straßen aus allen freigeschalteten Levels (SR-gesteuert).
  Ohne Auswahl ist das die Startaktion.
- F-16 Level-Stern-Bewertung: ★ alle einmal richtig, ★★ 80 % gemeistert, ★★★ M4 fehlerfrei bestanden.

### 2.4 Konto & Fortschritt
- F-17 Der Login läuft per E-Mail-Einmalcode über Cloudflare Access. Nur `/api/*` ist geschützt, die App selbst bleibt ohne Login nutzbar (siehe 5.1).
- F-18 Fortschritt (Boxen, Levels, Antwort-Historie) wird auf dem Server gespeichert und zwischen Geräten synchronisiert.
- F-19 Ohne Login kann man sofort spielen. Der lokale Fortschritt wird beim ersten Login übernommen.
- F-20 Man kann sein Konto samt Daten löschen und die eigenen Daten als JSON exportieren.

### 2.5 Statistik
- F-21 Das Dashboard zeigt: Anteil gemeistert je Bezirk und Level, eine **Fortschrittskarte**
  (Straßen nach Box eingefärbt), die Trefferquote über die Zeit, die Lernzeit, die „schwierigsten Straßen“ und Tage mit Aktivität.

### 2.6 Feedback
- F-22 Sound bei richtig/falsch/Level-Up, abschaltbar.
- F-23 Haptisches Feedback, soweit verfügbar (`navigator.vibrate`). Hinweis: iOS Safari unterstützt die
  Vibration-API nicht, dort gibt es visuelles Feedback als Ersatz (siehe 5.2).

## 3. Nicht-funktionale Anforderungen
- N-1 **PWA auf iOS**: installierbar („Zum Home-Bildschirm“), Vollbild (standalone), Safe-Area-Insets,
  Splash-Icons, keine Gummiband-Effekte beim Kartenziehen.
- N-2 **Offline**: App-Shell immer offline. Pro Bezirk lassen sich Tiles und Straßendaten herunterladen (Größe wird vorher angezeigt).
  Antworten landen offline in einer IndexedDB-Queue und werden bei Verbindung synchronisiert.
- N-3 **Performance**: erste Anzeige < 2 s auf 4G, Karte flüssig mit 60 fps auf iPhone 12+,
  JS-Bundle < 300 kB gz ohne MapLibre.
- N-4 **Hosting**: vollständig auf Cloudflare (Pages + Functions, D1, Access). Vorerst unter `*.pages.dev`. Kosten im Free-Tier.
- N-5 **Datenschutz**: gespeichert werden nur die E-Mail-Adresse und Lerndaten. Kein Tracking, keine Drittanbieter-Requests
  (auch kein externer Mail-Dienst). Tiles werden selbst gehostet.
- N-6 **Stadtunabhängig**: Stadt-spezifisches steckt nur in einer Konfiguration (Name, OSM-Relation, Bezirke) und in generierten Daten.
  Eine neue Stadt bedeutet: Config anlegen und die Pipeline laufen lassen.
- N-7 **Sprache**: UI auf Deutsch, Texte über i18n-Datei (Englisch später möglich).
- N-8 **Barrierefreiheit**: Farben nicht als einziges Signal (zusätzlich Icons/Muster), ausreichende Kontraste, Tastaturbedienung am Desktop.
- N-9 **Qualität**: TypeScript strict, Unit-Tests für Normalisierung, Scoring, SR und Level-Logik, E2E-Smoke-Test (Playwright), CI über GitHub Actions.

## 4. Außerhalb des Umfangs (vorerst)
- Öffentliche Bestenlisten, Multiplayer, Social Features
- Weitere Städte (die Architektur ist aber vorbereitet)
- POIs/Wahrzeichen, benannte Fußwege (per Config später zuschaltbar)
- Push-Benachrichtigungen / Tages-Streak
- Luftbild-Layer

## 5. Fallstricke & Lösungen

### 5.1 Login über Cloudflare Access auf der iOS-PWA
Wie bei spltrainer schützt **Cloudflare Access** (Zero Trust, kostenlos bis 50 Nutzer) die App, Login per
**One-time PIN**. Cloudflare verschickt die Codes selbst, deshalb brauchen wir weder eine eigene Domain noch Resend.
Unterschiede zu spltrainer:
- Geschützt ist nur der Pfad **`/api/*`** und nicht die ganze Seite. Spielen geht damit ohne Login und offline (F-19).
- „Anmelden“ ist eine normale Seitennavigation auf `/api/auth/login`. Access fragt E-Mail und Code ab und leitet danach zurück zur App.
  Ab dann schickt jeder `fetch` an `/api/*` das `CF_Authorization`-Cookie mit.
- Die Functions lesen die Identität aus dem signierten Header `Cf-Access-Jwt-Assertion`, prüfen ihn gegen die Access-Schlüssel
  und legen den Nutzer anhand der E-Mail an.
- Ist die Access-Session abgelaufen (Dauer einstellbar, z. B. 1 Monat), antwortet die API mit einem Redirect bzw. 401.
  Die App sammelt die Antworten dann weiter offline und zeigt „Erneut anmelden“.

**Risiko:** Eine iOS-PWA im Standalone-Modus öffnet fremde Domains (hier `<team>.cloudflareaccess.com`) unter Umständen
in einem eingebetteten Browser mit eigenem Cookie-Speicher. Das Cookie käme dann nicht in der PWA an. Das prüfen wir **früh
in M0 mit einem Test auf dem iPhone**. Falls es nicht geht, bauen wir einen eigenen Login mit Code-Eingabe direkt in der PWA
(Resend + eigene Domain, siehe `docs/PLAN.md` Abschnitt 9).

### 5.2 Haptik auf iOS
iOS Safari hat keine Vibration-API. Als Ersatz gibt es ein kurzes Wackeln bzw. Aufblitzen der Karte und Sound.
Man kann die System-Haptik über den `<input type="checkbox" switch>`-Trick auslösen (iOS 18+). Das bauen wir
als optionales, experimentelles Feature ein.

### 5.3 Datenqualität OSM
- Eine Straße besteht in OSM aus vielen Ways. Die Pipeline fasst sie nach Name und räumlicher Nähe zu einer Straßeneinheit zusammen.
- **Gleiche Namen an verschiedenen Orten** (z. B. mehrere „Kirchstraße“ in verschiedenen Stadtteilen) werden getrennte
  Einheiten mit derselben Bezeichnung. In M4 zählt eine Eingabe für alle passenden Einheiten im aktuellen Gebiet.
  In M1 kommen keine doppelten Namen als Antwortoptionen vor.
- Straßen über Bezirksgrenzen hinweg werden dem Bezirk mit dem größten Längenanteil zugeordnet und in den
  Nachbarbezirken als „Randstraße“ grau mit angezeigt.
- Plätze: `place=square`, `highway=pedestrian` + `area=yes` mit Namen, Darstellung als Fläche.
