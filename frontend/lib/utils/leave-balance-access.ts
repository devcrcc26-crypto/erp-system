/** Roles allowed to set / adjust employee leave balances. */
export const LEAVE_BALANCE_EDITOR_ROLES = [
  'System Administrator',
  'General Manager',
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
] as const;

export function canEditLeaveBalances(
  roles: ReadonlyArray<{ name: string }> | null | undefined,
): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  const allowed = new Set<string>(LEAVE_BALANCE_EDITOR_ROLES);
  return roles.some((role) => allowed.has(role.name));
}

export function leaveBalanceTypesForGender(
  gender: 'MALE' | 'FEMALE' | string | null | undefined,
): Array<'ANNUAL' | 'SICK' | 'MATERNITY'> {
  if (gender === 'FEMALE') {
    return ['ANNUAL', 'SICK', 'MATERNITY'];
  }
  return ['ANNUAL', 'SICK'];
}
