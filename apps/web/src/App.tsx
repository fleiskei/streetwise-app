import { lazy, Suspense } from "react";
import { useCityData } from "./lib/cityData";
import { useRoute } from "./lib/router";
import { Centered, Screen } from "./components/ui";
import { Home } from "./screens/Home";
import { DistrictScreen } from "./screens/District";
import { LevelScreen } from "./screens/Level";
import { Account } from "./screens/Account";

// The map (MapLibre, ~800 kB) loads only when needed.
const Explore = lazy(() => import("./screens/Explore").then((m) => ({ default: m.Explore })));
const Play = lazy(() => import("./screens/Play").then((m) => ({ default: m.Play })));
const Review = lazy(() => import("./screens/Review").then((m) => ({ default: m.Review })));

const Spinner = () => (
  <Centered>
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
  </Centered>
);

export function App() {
  const route = useRoute();
  const city = useCityData();

  if (route.name === "account") return <Account />;
  if (city.status === "loading") return <Spinner />;
  if (city.status !== "ready")
    return (
      <Screen>
        <Centered>
          <div className="max-w-sm">
            <p className="text-lg font-semibold text-[var(--text)]">
              {city.status === "missing" ? "Noch keine Stadtdaten" : "Fehler beim Laden"}
            </p>
            <p className="mt-2 text-sm">
              {city.status === "missing" ? (
                <>
                  Die Straßendaten wurden noch nicht erzeugt. Führe <code>pnpm data:aachen</code>{" "}
                  aus (siehe README).
                </>
              ) : (
                city.error
              )}
            </p>
          </div>
        </Centered>
      </Screen>
    );

  const { data } = city;
  switch (route.name) {
    case "district":
      return <DistrictScreen data={data} districtId={route.districtId} />;
    case "level":
      return <LevelScreen data={data} levelId={route.levelId} />;
    case "play":
      return (
        <Suspense fallback={<Spinner />}>
          <Play
            key={`${route.levelId}/${route.mode}`}
            data={data}
            levelId={route.levelId}
            mode={route.mode}
          />
        </Suspense>
      );
    case "review":
      return (
        <Suspense fallback={<Spinner />}>
          <Review data={data} />
        </Suspense>
      );
    case "explore":
      return (
        <Suspense fallback={<Spinner />}>
          <Explore data={data} levelId={route.levelId} />
        </Suspense>
      );
    default:
      return <Home data={data} />;
  }
}
