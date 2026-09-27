import { useEffect, useState } from "react";
import { login, logout } from "../lib/api";
import { useProgress } from "../lib/progress";
import { refreshAccount, syncNow, useSync } from "../lib/sync";
import { href } from "../lib/router";
import { updateSettings, useSettings, type Settings } from "../lib/settings";
import { Card, Screen, TopBar } from "../components/ui";

const REASONS: Record<string, string> = {
  access_not_configured:
    "Der Login ist auf dem Server noch nicht eingerichtet (Cloudflare Access).",
  unauthenticated: "Du bist nicht angemeldet.",
  invalid_token: "Deine Anmeldung ist abgelaufen oder ungültig.",
  network: "Server nicht erreichbar.",
};

function ago(ts: number | null): string {
  if (!ts) return "noch nie";
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  return new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function Account() {
  const sync = useSync();
  const progress = useProgress();
  const settings = useSettings();
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    void refreshAccount();
  }, []);
  const me = sync.account;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;

  const deleteAccount = async () => {
    if (
      !window.confirm(
        "Konto und alle auf dem Server gespeicherten Daten endgültig löschen? Die Daten auf diesem Gerät bleiben erhalten.",
      )
    )
      return;
    setDeleting(true);
    const res = await fetch("/api/me", {
      method: "DELETE",
      credentials: "same-origin",
      redirect: "manual",
    }).catch(() => null);
    setDeleting(false);
    if (res?.ok) logout();
    else window.alert("Löschen hat nicht geklappt – bitte später erneut versuchen.");
  };

  return (
    <Screen>
      <TopBar title="Konto" back={href({ name: "home" })} />
      <Card>
        {me.status === "unknown" && <p className="text-[var(--muted)]">Prüfe Anmeldung …</p>}
        {me.status === "loggedIn" && (
          <>
            <p className="text-sm text-[var(--muted)]">Angemeldet als</p>
            <p className="text-lg font-semibold">{me.email}</p>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
              <span>
                {sync.syncing ? "Synchronisiere …" : `Synchronisiert: ${ago(sync.lastSync)}`}
                {progress.pending.length > 0 && !sync.syncing && (
                  <span className="block text-xs text-[var(--muted)]">
                    {progress.pending.length} Antworten warten auf Upload
                  </span>
                )}
                {sync.error && <span className="block text-xs text-bad">Fehler: {sync.error}</span>}
              </span>
              <button
                onClick={() => void syncNow(true)}
                disabled={sync.syncing}
                className="shrink-0 font-semibold text-brand disabled:opacity-50"
              >
                Jetzt
              </button>
            </div>
            <button
              onClick={logout}
              className="mt-4 rounded-xl border border-[var(--line)] px-4 py-2.5 font-medium"
            >
              Abmelden
            </button>
          </>
        )}
        {me.status === "loggedOut" && (
          <>
            <p className="font-semibold">
              {me.reason === "session_expired"
                ? "Anmeldung abgelaufen"
                : "Fortschritt geräteübergreifend speichern"}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {me.reason === "session_expired"
                ? "Melde dich erneut an, damit dein Fortschritt wieder synchronisiert wird. Bis dahin wird alles auf diesem Gerät gespeichert."
                : `Melde dich mit deiner E-Mail-Adresse an – du bekommst einen Einmal-Code. Dein bisheriger Fortschritt auf diesem Gerät wird übernommen. ${REASONS[me.reason] ?? ""}`}
            </p>
            <button
              onClick={login}
              className="mt-4 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow active:scale-[0.99]"
            >
              Anmelden
            </button>
          </>
        )}
        {me.status === "offline" && (
          <p className="text-[var(--muted)]">
            Du bist offline. Spielen geht trotzdem – der Fortschritt wird später synchronisiert.
          </p>
        )}
      </Card>
      <h2 className="mb-2 mt-6 px-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Einstellungen
      </h2>
      <Card className="divide-y divide-[var(--line)] p-0">
        <Toggle
          label="Sound"
          checked={settings.sound}
          onChange={(v) => updateSettings({ sound: v })}
        />
        <Toggle
          label="Haptisches Feedback"
          hint="Auf dem iPhone ab iOS 18"
          checked={settings.haptics}
          onChange={(v) => updateSettings({ haptics: v })}
        />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-medium">Vorschläge beim Eintippen</p>
            <p className="text-xs text-[var(--muted)]">Im Modus „Karte vervollständigen“</p>
          </div>
          <select
            value={settings.autocompleteMinChars}
            onChange={(e) =>
              updateSettings({
                autocompleteMinChars: Number(e.target.value) as Settings["autocompleteMinChars"],
              })
            }
            className="rounded-lg border border-[var(--line)] bg-[var(--surface-solid)] px-2 py-1.5"
          >
            <option value={2}>ab 2 Zeichen</option>
            <option value={3}>ab 3 Zeichen</option>
            <option value={4}>ab 4 Zeichen</option>
            <option value={0}>aus</option>
          </select>
        </div>
      </Card>
      {me.status === "loggedIn" && (
        <>
          <h2 className="mb-2 mt-6 px-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Deine Daten
          </h2>
          <Card className="divide-y divide-[var(--line)] p-0">
            <a href="/api/export" download className="block px-4 py-3 font-medium">
              Daten exportieren (JSON)
            </a>
            <button
              onClick={() => void deleteAccount()}
              disabled={deleting}
              className="block w-full px-4 py-3 text-left font-medium text-bad disabled:opacity-50"
            >
              {deleting ? "Lösche …" : "Konto und Serverdaten löschen"}
            </button>
          </Card>
        </>
      )}
      <p className="mt-6 px-1 text-xs text-[var(--muted)]">
        Modus: {standalone ? "installierte App" : "Browser"} · Version {__APP_VERSION__}
      </p>
    </Screen>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-9 accent-brand"
      />
    </label>
  );
}
