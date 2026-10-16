import { matchKey, normaliseName } from './name-normalise';

/** Raw "Report to" spellings → canonical English full name (surname first). */
const REPORT_TO_ALIASES: Readonly<Record<string, string>> = {
  'huand xin': 'Huang Xin',
  'ms.dong j.x.': 'Dong Jinxia',
  'dong j.x.': 'Dong Jinxia',
  'ms dong j x': 'Dong Jinxia',
  'dong j x': 'Dong Jinxia',
};

/** Strips Mr./Ms./Mrs./Dr. with or without a following space (e.g. "Mr.huand Xin"). */
const TITLE_PREFIX = /^(mr|ms|mrs|dr)\.?\s*/i;

/** Strips honorifics and applies known typo aliases. */
export function stripReportToTitles(raw: string): string {
  let value = normaliseName(raw);
  while (TITLE_PREFIX.test(value)) {
    value = value.replace(TITLE_PREFIX, '').trim();
  }
  return value;
}

/**
 * Normalises a supervisor name for grouping and lookup.
 * Returns canonical display form (title case words) when alias hits.
 */
export function normaliseSupervisorName(raw: string): string {
  const stripped = stripReportToTitles(raw);
  if (!stripped) return '';
  const aliasKey = stripped.toLowerCase();
  const alias = REPORT_TO_ALIASES[aliasKey];
  if (alias) return alias;
  return stripped
    .split(/\s+/)
    .map((part) =>
      part.length <= 2 && /^[a-z]\.?$/i.test(part)
        ? part.toUpperCase().replace('.', '')
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

/** Keys used to match a normalised supervisor name to a user account. */
export function supervisorLookupKeys(canonical: string): string[] {
  const norm = normaliseName(canonical).toLowerCase();
  const tokens = norm.split(/\s+/).filter(Boolean);
  const keys = new Set<string>([norm]);
  if (tokens.length >= 2) {
    keys.add(tokens.join(' '));
    keys.add([...tokens].reverse().join(' '));
  }
  // Same form as the employee-matching name keys (punctuation → space, H/ G/ W/ expanded).
  const matchTokens = matchKey(canonical).split(' ').filter(Boolean);
  if (matchTokens.length) {
    keys.add(matchTokens.join(' '));
    keys.add([...matchTokens].reverse().join(' '));
  }
  return [...keys];
}

export function flagProbableSupervisorDuplicates(
  byCanonical: Map<string, { rawVariants: Set<string>; count: number }>,
): Array<{ canonical: string; variants: string[]; count: number }> {
  const groups = new Map<string, string[]>();
  for (const [canonical, meta] of byCanonical) {
    const bucket = canonical.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
    const list = groups.get(bucket) ?? [];
    list.push(canonical);
    groups.set(bucket, list);
    if (meta.rawVariants.size > 1) {
      const key = `raw:${[...meta.rawVariants].sort().join('|')}`;
      groups.set(key, [canonical]);
    }
  }
  const flagged: Array<{ canonical: string; variants: string[]; count: number }> = [];
  for (const variants of groups.values()) {
    if (variants.length < 2) continue;
    for (const canonical of variants) {
      const meta = byCanonical.get(canonical);
      if (meta) {
        flagged.push({
          canonical,
          variants: [...meta.rawVariants].sort(),
          count: meta.count,
        });
      }
    }
  }
  return flagged.sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));
}
