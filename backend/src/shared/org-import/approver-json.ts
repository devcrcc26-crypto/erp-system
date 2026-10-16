import { normaliseName } from './name-normalise';
import { normaliseSupervisorName } from './supervisor-normalise';

export type ApproverJsonRow = {
  fullName: string;
  chineseName?: string | null;
  role?: string | null;
};

/** Canonical supervisor names declared in approver-only-users.json. */
export function approverJsonCanonicalNames(
  rows: readonly ApproverJsonRow[],
): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    const name = row.fullName?.trim();
    if (!name) continue;
    set.add(normaliseSupervisorName(name));
    set.add(normaliseName(name).toLowerCase());
  }
  return set;
}

export function isSupervisorInApproverJson(
  canonical: string,
  rows: readonly ApproverJsonRow[],
): boolean {
  const key = normaliseSupervisorName(canonical);
  for (const row of rows) {
    if (normaliseSupervisorName(row.fullName) === key) return true;
  }
  return false;
}
