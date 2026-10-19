export const EXIT_PERMIT_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageExitPermitImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => EXIT_PERMIT_IMPORT_ROLES.has(name));
}
