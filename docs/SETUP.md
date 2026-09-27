# Einrichtung: Cloudflare & GitHub

Einmalige Schritte, damit Streetwise unter `https://streetwise.pages.dev` läuft und der Login funktioniert.
Alles geht mit dem kostenlosen Cloudflare-Plan.

## 1. API-Token und Account-ID (für GitHub Actions)

1. Cloudflare-Dashboard → rechts oben Profil → **My Profile → API Tokens → Create Token → Custom token**.
2. Berechtigungen: **Account · Cloudflare Pages · Edit** und **Account · D1 · Edit** (D1 ab Meilenstein M4).
   Ein vorhandenes Token (z. B. von spltrainer) kann man stattdessen um diese Rechte erweitern.
3. Account-ID: Dashboard → **Workers & Pages** → rechts „Account ID“.
4. GitHub → Repo `fleiskei/streetwise-app` → **Settings → Secrets and variables → Actions**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

## 2. Pages-Projekt anlegen

Entweder im Dashboard **Workers & Pages → Create → Pages → Direct Upload** mit dem Namen `streetwise`
(ohne Dateien hochzuladen abbrechen, wenn das Projekt angelegt ist), oder lokal:

```bash
pnpm --filter @streetwise/web exec wrangler pages project create streetwise --production-branch=main
```

Danach deployt der Workflow `.github/workflows/deploy.yml` bei jedem Push:
`main` → `streetwise.pages.dev`, andere Branches → `<branch>.streetwise.pages.dev`.

> Das Projekt **nicht** mit Git verbinden (kein „Connect to Git“), sonst kollidieren die beiden Deploy-Wege.

## 3. Login mit Cloudflare Access (nur `/api/*`)

1. Dashboard → **Zero Trust** (beim ersten Mal Team-Namen wählen, Free-Plan).
   Der Team-Name ergibt die Domain `<team>.cloudflareaccess.com`.
2. **Settings → Authentication → Login methods**: „One-time PIN“ ist standardmäßig aktiv.
3. **Access → Applications → Add an application → Self-hosted**:
   - Application name: `Streetwise API`
   - Session duration: z. B. **1 month**
   - Public hostname: Domain `streetwise.pages.dev`, **Path `api`**
     (optional zweiter Eintrag `*.streetwise.pages.dev` / Path `api` für Preview-Deployments)
   - Policy: Action **Allow**, Include → **Emails** → deine Adresse(n)
4. Nach dem Speichern: in der Application unter **Overview** das **Application Audience (AUD) Tag** kopieren.
5. In `apps/web/wrangler.toml` eintragen (oder mir schicken, dann committe ich es):

   ```toml
   [vars]
   ACCESS_TEAM_DOMAIN = "<team>.cloudflareaccess.com"
   ACCESS_AUD = "<AUD-Tag>"
   ```

   Beide Werte sind nicht geheim; die API prüft damit die Signatur der Access-Tokens.

## 4. Login auf dem iPhone testen (Meilenstein M0)

1. `https://streetwise.pages.dev` in Safari öffnen → Teilen → **Zum Home-Bildschirm**.
2. App vom Home-Bildschirm starten → Profil-Symbol oben rechts → **Anmelden**.
3. E-Mail eingeben, Code aus der Mail eintippen.
4. Erwartet: Zurück in der App steht „Angemeldet als …“.

Bitte melde, ob das klappt – insbesondere, ob nach der Code-Eingabe die **installierte App** angemeldet ist
(und nicht nur ein Safari-Fenster). Falls nicht, bauen wir den Fallback aus `docs/PLAN.md` Abschnitt 9.

## 5. D1-Datenbank (M4, erledigt)

Die Datenbank `streetwise` ist angelegt und in `apps/web/wrangler.toml` eingetragen. Die Migrationen in
`apps/web/migrations` spielt der Deploy-Workflow automatisch ein (`wrangler d1 migrations apply --remote`).
Dafür braucht `CLOUDFLARE_API_TOKEN` die Berechtigung **Account · D1 · Edit**.

Lokal: `pnpm --filter @streetwise/web exec wrangler d1 migrations apply streetwise --local`, danach
`pnpm build && pnpm --filter @streetwise/web dev:api` (mit `.dev.vars`, siehe `.dev.vars.example`).
