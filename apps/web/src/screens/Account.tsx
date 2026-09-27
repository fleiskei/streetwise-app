import { useEffect, useState } from "react";
import { fetchMe, login, logout, type Me } from "../lib/api";
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

export function Account() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetchMe().then(setMe);
  }, []);
  const settings = useSettings();
  const standalone = window.matchMedia("(display-mode: standalone)").matches;

  return (
    <Screen>
      <TopBar title="Konto" back={href({ name: "home" })} />
      <Card>
        {me === null && <p className="text-[var(--muted)]">Prüfe Anmeldung …</p>}
        {me?.status === "loggedIn" && (
          <>
            <p className="text-sm text-[var(--muted)]">Angemeldet als</p>
            <p className="text-lg font-semibold">{me.email}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Dein Fortschritt wird auf dem Server gespeichert.
            </p>
            <button
              onClick={logout}
              className="mt-4 rounded-xl border border-[var(--line)] px-4 py-2.5 font-medium"
            >
              Abmelden
            </button>
          </>
        )}
        {me?.status === "loggedOut" && (
          <>
            <p className="font-semibold">Fortschritt geräteübergreifend speichern</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Melde dich mit deiner E-Mail-Adresse an – du bekommst einen Einmal-Code.{" "}
              {REASONS[me.reason] ?? ""}
            </p>
            <button
              onClick={login}
              className="mt-4 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow active:scale-[0.99]"
            >
              Anmelden
            </button>
          </>
        )}
        {me?.status === "offline" && (
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
