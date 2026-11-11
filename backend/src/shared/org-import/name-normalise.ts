/** Trim and collapse whitespace (same normaliser as the attendance / contract seeds). */
export function normaliseName(name: string | null | undefined): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/** Ethiopian honorifics written with a slash (W/ro = Woizero, W/rt / W/t = Woizerit). */
const SLASH_TITLE = /(^|\s)w\s*\/\s*(ro|rt|t)\b\.?/gi;

/** Abbreviated name prefixes: "G/Medhin" → "Gebremedhin". */
const SLASH_PREFIXES: Readonly<Record<string, string>> = {
  h: 'haile',
  g: 'gebre',
  w: 'wolde',
};
const SLASH_PREFIX = /(^|[^\p{L}])([hgw])\s*\/\s*(?=\p{L})/giu;

/**
 * Lower-case match form used on both sides of employee matching (sheet and DB):
 * drops W/ro-style titles, expands H/ G/ W/, then turns punctuation into spaces.
 * Does not change normaliseName(), which supervisor and approver lookups share.
 */
export function matchKey(name: string | null | undefined): string {
  return normaliseName(name)
    .toLowerCase()
    .replace(SLASH_TITLE, ' ')
    .replace(SLASH_PREFIX, (_, before: string, letter: string) =>
      `${before}${SLASH_PREFIXES[letter.toLowerCase()]}`,
    )
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Lower-case letters and digits only - "Leul  Tesfaye" and "LeulTesfaye" compare equal. */
export function compactName(name: string | null | undefined): string {
  return matchKey(name).replace(/[^a-z0-9]/g, '');
}

/** Lower-case word tokens of matchKey(). */
export function nameTokens(name: string | null | undefined): string[] {
  return matchKey(name)
    .split(' ')
    .filter((token) => token.length > 0);
}

/** Levenshtein distance (small strings only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}
