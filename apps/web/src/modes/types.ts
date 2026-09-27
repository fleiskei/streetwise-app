import type { District, Level, Mode } from "@streetwise/core";
import type { CityData } from "../lib/cityData";

export interface RoundResult {
  streetId: string;
  correct: boolean;
}

export interface ModeProps {
  data: CityData;
  level: Level;
  district: District;
  /** Streets of this round. */
  ids: string[];
  back: string;
  onDone: (results: RoundResult[], opts?: { perfect?: boolean }) => void;
  /** Set when the mode shows a single question of a longer sequence (review). */
  step?: { index: number; total: number; title: string };
}

export const MODE_INFO: Record<
  Mode,
  { title: string; short: string; description: string; difficulty: string }
> = {
  choice: {
    title: "Multiple Choice",
    short: "Auswahl",
    description: "Eine Straße ist markiert – wähle aus vier Namen.",
    difficulty: "leicht",
  },
  match: {
    title: "Zuordnen",
    short: "Zuordnen",
    description: "Ordne fünf nummerierten Straßen die richtigen Namen zu.",
    difficulty: "mittel",
  },
  locate: {
    title: "Antippen",
    short: "Antippen",
    description: "Ein Name wird genannt – tippe die Straße auf der Karte an.",
    difficulty: "mittel",
  },
  postcode: {
    title: "PLZ zuordnen",
    short: "PLZ",
    description: "Welche Postleitzahl hat die markierte Straße? Danach siehst du das PLZ-Gebiet.",
    difficulty: "leicht",
  },
  complete: {
    title: "Karte vervollständigen",
    short: "Vervollständigen",
    description: "Trage auf der Stadtkarte Straßennamen ein – dein Stand bleibt gespeichert.",
    difficulty: "schwer",
  },
};
