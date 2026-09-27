import { useEffect, useState } from "react";
import { fetchMe, login, logout, type Me } from "../lib/api";
import { href } from "../lib/router";
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
      <p className="mt-6 px-1 text-xs text-[var(--muted)]">
        Modus: {standalone ? "installierte App" : "Browser"} · Version {__APP_VERSION__}
      </p>
    </Screen>
  );
}
