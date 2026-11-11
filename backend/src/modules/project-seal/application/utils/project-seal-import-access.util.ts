export const PROJECT_SEAL_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageProjectSealImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => PROJECT_SEAL_IMPORT_ROLES.has(name));
}
