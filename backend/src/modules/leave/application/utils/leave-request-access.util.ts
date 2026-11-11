/**
 * Roles allowed to bulk-import leave requests on behalf of employees.
 */
export const LEAVE_REQUEST_EDITOR_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'General Manager',
  'Managing Director',
  'HR Manager',
  'HR Officer',
]);

export function canEditLeaveRequests(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => LEAVE_REQUEST_EDITOR_ROLES.has(name));
}
