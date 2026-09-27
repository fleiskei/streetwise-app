/**
 * Normalises street names for comparison and autocomplete: case, umlauts, ß/ss,
 * "Str."/"Straße", hyphens and whitespace do not matter.
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFC")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/str\.(?=\s|$|-)/g, "strasse")
    .replace(/\bst\.\s*/g, "sankt ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Word-start positions in the normalised form, used for mid-name matches ("Straße" in "Aachener Straße"). */
export function normalizedWords(input: string): string[] {
  return input
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(normalizeName)
    .filter(Boolean);
}
