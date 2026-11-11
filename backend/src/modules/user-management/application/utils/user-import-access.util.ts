export const USER_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageUserImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => USER_IMPORT_ROLES.has(name));
}
