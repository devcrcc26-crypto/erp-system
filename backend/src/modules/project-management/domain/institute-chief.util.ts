/**
 * True when the subtask designates an external Institute Chief (name only, no system account).
 */
export function isExternalInstituteChief(pkg: {
  instituteChiefUserId: string | null;
  instituteChiefName?: string | null;
}): boolean {
  return !pkg.instituteChiefUserId && Boolean(pkg.instituteChiefName?.trim());
}
