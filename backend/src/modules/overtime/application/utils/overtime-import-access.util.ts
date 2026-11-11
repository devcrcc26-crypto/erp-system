/**
 * Roles allowed to perform company-wide overtime entry imports.
 */
export const OVERTIME_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'General Manager',
  'Managing Director',
  'HR Manager',
  'HR Officer',
]);

export function canManageOvertimeImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => OVERTIME_IMPORT_ROLES.has(name));
}
