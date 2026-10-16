import {
  compactName,
  matchKey,
  nameTokens,
  normaliseName,
  similarity,
} from './name-normalise';

/**
 * Matches HR-directory names to ERP users.
 *
 * Order: manual alias table (org-aliases.json) → attendance identities (sheet name =
 * a MAPPED Deli attendance name) → exact name keys (as in
 * scripts/seed-contracts-from-august-2026.ts: full, reversed, first+last, first+middle)
 * → first+middle when the DB repeats or lacks the last name → compact (letters only, also with
 * the repeated part removed) → fuzzy proposal.
 *
 * Names on both sides go through matchKey() (W/ro dropped, H/ G/ W/ expanded,
 * punctuation → space). Each step must find exactly one user. Spelling variants are
 * only PROPOSED, never applied. A row whose attendance user differs from the name /
 * fuzzy result is a CONFLICT; rows that repeat a name are flagged and not matched.
 */

export interface DirectoryUser {
  id: string;
  employeeId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
}

/** Sheet name (as written in the HR file) → ERP employeeId. */
export type EmployeeAliasTable = Readonly<Record<string, string>>;

/** A MAPPED attendance identity: device name → ERP user. */
export interface AttendanceNameLink {
  attendanceName: string;
  userId: string;
}

export type EmployeeMatchStatus =
  | 'EXACT'
  | 'ALIAS'
  | 'PROPOSED'
  | 'CONFLICT'
  | 'UNMATCHED';

export type EmployeeMatchRule =
  | 'alias'
  | 'attendance'
  | 'name'
  | 'first-middle'
  | 'compact'
  | 'fuzzy'
  | 'fuzzy-single-token';

export interface EmployeeMatch {
  sheetName: string;
  status: EmployeeMatchStatus;
  rule?: EmployeeMatchRule;
  userId?: string;
  employeeId?: string | null;
  /** Fuzzy score 0–1 for PROPOSED. */
  score?: number;
  reason?: string;
  /** Another sheet row has the same name, or one name is a prefix of the other; not matched. */
  duplicateRow?: boolean;
  /** CONFLICT only: what each source said. */
  conflict?: {
    attendance: { userId: string; employeeId: string | null };
    other: {
      rule: EmployeeMatchRule;
      userId: string;
      employeeId: string | null;
      score?: number;
    };
  };
}

/** Minimum fuzzy score to propose a match. */
export const PROPOSE_THRESHOLD = 0.75;
/** Best candidate must beat the runner-up by this margin. */
const PROPOSE_MARGIN = 0.05;

function userParts(user: DirectoryUser): string[] {
  return [user.firstName, user.middleName, user.lastName]
    .map((part) => matchKey(part))
    .filter((part) => part.length > 0);
}

/** Drops consecutive repeated parts: "a b b" → "a b" (DB rows that copy the middle name as last name). */
export function dedupeRepeatedParts(parts: readonly string[]): string[] {
  return parts.filter((part, index) => index === 0 || part !== parts[index - 1]);
}

/** True when the stored last name repeats the middle name. */
export function repeatsLastName(user: DirectoryUser): boolean {
  const middle = matchKey(user.middleName);
  return middle.length > 0 && middle === matchKey(user.lastName);
}

/** Same keys as nameKeys() in the contract seed. */
export function seedNameKeys(user: DirectoryUser): string[] {
  const parts = userParts(user);
  const keys = new Set<string>();
  if (parts.length >= 2) {
    keys.add(parts.join(' '));
    keys.add([...parts].reverse().join(' '));
    if (parts.length === 3) {
      keys.add(`${parts[0]} ${parts[2]}`);
      keys.add(`${parts[2]} ${parts[0]}`);
      keys.add(`${parts[0]} ${parts[1]}`);
      keys.add(`${parts[1]} ${parts[0]}`);
    }
  }
  return [...keys];
}

function addToIndex(index: Map<string, Set<string>>, key: string, id: string): void {
  if (!key) return;
  const set = index.get(key) ?? new Set<string>();
  set.add(id);
  index.set(key, set);
}

/** Fuzzy score between a sheet name and a user (max of whole-name and per-token similarity). */
export function fuzzyNameScore(sheetName: string, user: DirectoryUser): number {
  const sheet = nameTokens(sheetName);
  const db = dedupeRepeatedParts(userParts(user));
  if (!sheet.length || !db.length) return 0;

  let best = similarity(sheet.join(''), db.join(''));
  if (sheet.length >= 2 && db.length >= 2) {
    const straight = (similarity(sheet[0]!, db[0]!) + similarity(sheet[1]!, db[1]!)) / 2;
    const crossed = (similarity(sheet[0]!, db[1]!) + similarity(sheet[1]!, db[0]!)) / 2;
    best = Math.max(best, straight, crossed);
  }
  return Math.round(best * 1000) / 1000;
}

interface FuzzyProposal {
  user: DirectoryUser;
  rule: 'fuzzy' | 'fuzzy-single-token';
  score: number;
}

/** Best fuzzy candidate in `pool`, or null when none clears the threshold and margin. */
function proposeFuzzy(
  sheetName: string,
  pool: readonly DirectoryUser[],
): FuzzyProposal | null {
  const tokens = nameTokens(sheetName);
  if (tokens.length === 1) {
    const hits = pool.filter((u) => userParts(u)[0] === tokens[0]);
    return hits.length === 1
      ? { user: hits[0]!, rule: 'fuzzy-single-token', score: 0.5 }
      : null;
  }
  const scored = pool
    .map((u) => ({ u, score: fuzzyNameScore(sheetName, u) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];
  if (
    best &&
    best.score >= PROPOSE_THRESHOLD &&
    (!runnerUp || best.score - runnerUp.score >= PROPOSE_MARGIN)
  ) {
    return { user: best.u, rule: 'fuzzy', score: best.score };
  }
  return null;
}

export function matchEmployees(
  sheetNames: readonly string[],
  users: readonly DirectoryUser[],
  aliases: EmployeeAliasTable = {},
  attendance: readonly AttendanceNameLink[] = [],
): EmployeeMatch[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const byEmployeeId = new Map(
    users.filter((u) => u.employeeId).map((u) => [u.employeeId!, u]),
  );
  const aliasByKey = new Map(
    Object.entries(aliases).map(([name, employeeId]) => [matchKey(name), employeeId]),
  );

  // Attendance names → users (identities pointing at users outside `users` are ignored).
  const byAttendance = new Map<string, Set<string>>();
  for (const link of attendance) {
    if (!byId.has(link.userId)) continue;
    addToIndex(byAttendance, matchKey(link.attendanceName), link.userId);
  }

  const byKey = new Map<string, Set<string>>();
  const byFirstMiddle = new Map<string, Set<string>>();
  const byCompact = new Map<string, Set<string>>();
  for (const user of users) {
    for (const key of seedNameKeys(user)) addToIndex(byKey, key, user.id);
    const parts = userParts(user);
    // First + middle also identifies users whose lastName repeats middleName or is empty.
    if ((repeatsLastName(user) || !matchKey(user.lastName)) && parts.length >= 2) {
      addToIndex(byFirstMiddle, `${parts[0]} ${parts[1]}`, user.id);
    }
    addToIndex(byCompact, parts.join(''), user.id);
    addToIndex(byCompact, dedupeRepeatedParts(parts).join(''), user.id);
  }

  const resolveUnique = (
    ids: Set<string> | undefined,
  ): { id?: string; ambiguous: boolean } => {
    if (!ids || ids.size === 0) return { ambiguous: false };
    if (ids.size > 1) return { ambiguous: true };
    return { id: [...ids][0], ambiguous: false };
  };

  /** Name-key steps (name → first-middle → compact) on their own. */
  const nameSteps = (
    sheetName: string,
  ): { rule: EmployeeMatchRule; id?: string; ambiguous?: number } | null => {
    const key = matchKey(sheetName);
    const tokens = nameTokens(sheetName);
    const steps: Array<[EmployeeMatchRule, Set<string> | undefined]> = [
      ['name', byKey.get(key) ?? byKey.get([...tokens].reverse().join(' '))],
      ['first-middle', tokens.length >= 3 ? byFirstMiddle.get(`${tokens[0]} ${tokens[1]}`) : undefined],
      ['compact', byCompact.get(compactName(sheetName))],
    ];
    for (const [rule, ids] of steps) {
      const hit = resolveUnique(ids);
      if (hit.ambiguous) return { rule, ambiguous: ids!.size };
      if (hit.id) return { rule, id: hit.id };
    }
    return null;
  };

  const exact = (sheetName: string, rule: EmployeeMatchRule, userId: string): EmployeeMatch => ({
    sheetName,
    status: 'EXACT',
    rule,
    userId,
    employeeId: byId.get(userId)?.employeeId ?? null,
  });

  const results: EmployeeMatch[] = sheetNames.map((rawName) => {
    const sheetName = normaliseName(rawName);
    const key = matchKey(sheetName);

    const aliasTarget = aliasByKey.get(key);
    if (aliasTarget) {
      const user = byEmployeeId.get(aliasTarget);
      return user
        ? { sheetName, status: 'ALIAS', rule: 'alias', userId: user.id, employeeId: user.employeeId }
        : { sheetName, status: 'UNMATCHED', reason: `alias target ${aliasTarget} not found` };
    }

    const tokens = nameTokens(sheetName);
    const attendanceHit = resolveUnique(
      byAttendance.get(key) ?? byAttendance.get([...tokens].reverse().join(' ')),
    );
    if (attendanceHit.id) return exact(sheetName, 'attendance', attendanceHit.id);
    // Ambiguous attendance names fall through to the name steps.

    const hit = nameSteps(sheetName);
    if (hit?.ambiguous) {
      return { sheetName, status: 'UNMATCHED', reason: `ambiguous (${hit.rule}: ${hit.ambiguous} users)` };
    }
    if (hit?.id) return exact(sheetName, hit.rule, hit.id);
    return { sheetName, status: 'UNMATCHED', reason: 'no match' };
  });

  // Sheet rows that repeat a name, or whose name (2+ words) starts another row's name
  // ("A B" vs "A B C"): flagged, none of them is matched.
  const duplicateReasons = new Map<number, string>();
  const rowsByKey = new Map<string, number[]>();
  sheetNames.forEach((name, i) => {
    const key = matchKey(name);
    if (key) rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), i]);
  });
  for (const indexes of rowsByKey.values()) {
    if (indexes.length < 2) continue;
    for (const i of indexes) {
      duplicateReasons.set(i, `duplicate row (${indexes.length} rows share this name)`);
    }
  }
  const sheetTokens = sheetNames.map((name) => nameTokens(name));
  sheetTokens.forEach((short, i) => {
    if (short.length < 2) return;
    sheetTokens.forEach((long, j) => {
      if (long.length <= short.length) return;
      if (!short.every((token, k) => long[k] === token)) return;
      for (const row of [i, j]) {
        if (!duplicateReasons.has(row)) {
          duplicateReasons.set(row, 'duplicate row (name is a prefix of another row)');
        }
      }
    });
  });
  for (const [i, reason] of duplicateReasons) {
    results[i] = {
      sheetName: results[i]!.sheetName,
      status: 'UNMATCHED',
      reason,
      duplicateRow: true,
    };
  }

  // One user per sheet row: a user claimed twice is not trusted for either row (alias wins).
  const claims = new Map<string, number[]>();
  results.forEach((r, i) => {
    if (r.userId) claims.set(r.userId, [...(claims.get(r.userId) ?? []), i]);
  });
  for (const [, indexes] of claims) {
    if (indexes.length < 2) continue;
    const aliasIndex = indexes.find((i) => results[i]!.status === 'ALIAS');
    for (const i of indexes) {
      if (i === aliasIndex) continue;
      results[i] = {
        sheetName: results[i]!.sheetName,
        status: 'UNMATCHED',
        reason: `same user matched by ${indexes.length} rows`,
      };
    }
  }

  const claimedBy = new Map<string, number>();
  results.forEach((r, i) => {
    if (r.userId) claimedBy.set(r.userId, i);
  });
  const poolFor = (row: number): DirectoryUser[] =>
    users.filter((u) => {
      const owner = claimedBy.get(u.id);
      return owner === undefined || owner === row;
    });

  // Attendance vs name / fuzzy: any disagreement makes the row a CONFLICT (not imported).
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]!;
    if (r.rule !== 'attendance' || !r.userId) continue;
    const named = nameSteps(r.sheetName);
    let other: NonNullable<EmployeeMatch['conflict']>['other'] | null = null;
    if (named?.id) {
      if (named.id !== r.userId) {
        other = { rule: named.rule, userId: named.id, employeeId: byId.get(named.id)?.employeeId ?? null };
      }
    } else {
      const fuzzy = proposeFuzzy(r.sheetName, poolFor(i));
      if (fuzzy && fuzzy.user.id !== r.userId) {
        other = { rule: fuzzy.rule, userId: fuzzy.user.id, employeeId: fuzzy.user.employeeId, score: fuzzy.score };
      }
    }
    if (!other) continue;
    results[i] = {
      sheetName: r.sheetName,
      status: 'CONFLICT',
      reason: `attendance and ${other.rule} disagree`,
      conflict: {
        attendance: { userId: r.userId, employeeId: r.employeeId ?? null },
        other,
      },
    };
    claimedBy.delete(r.userId);
  }

  // Fuzzy proposals only against users no row has claimed.
  const open = users.filter((u) => !claimedBy.has(u.id));
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i]!;
    if (r.status !== 'UNMATCHED' || r.duplicateRow || r.reason?.startsWith('same user')) continue;
    const fuzzy = proposeFuzzy(r.sheetName, open);
    if (!fuzzy) continue;
    results[i] = {
      sheetName: r.sheetName,
      status: 'PROPOSED',
      rule: fuzzy.rule,
      userId: fuzzy.user.id,
      employeeId: fuzzy.user.employeeId,
      score: fuzzy.score,
      ...(fuzzy.rule === 'fuzzy-single-token'
        ? { reason: 'single name on sheet matches one first name' }
        : {}),
    };
  }

  return results;
}

/** Report bucket for a match: alias / attendance / name / compact / proposed / conflict / unmatched. */
export type MatchBucket =
  | 'alias'
  | 'attendance'
  | 'name'
  | 'compact'
  | 'proposed'
  | 'conflict'
  | 'unmatched';

export function matchBucket(match: EmployeeMatch): MatchBucket {
  switch (match.status) {
    case 'ALIAS':
      return 'alias';
    case 'PROPOSED':
      return 'proposed';
    case 'CONFLICT':
      return 'conflict';
    case 'UNMATCHED':
      return 'unmatched';
    case 'EXACT':
      if (match.rule === 'attendance') return 'attendance';
      if (match.rule === 'compact') return 'compact';
      return 'name';
  }
}
