/**
 * Roles allowed to set / adjust employee leave balances
 * (Balances tab editors - not employee self-service).
 */
export const LEAVE_BALANCE_EDITOR_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'General Manager',
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
]);

export function canEditLeaveBalances(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => LEAVE_BALANCE_EDITOR_ROLES.has(name));
}
