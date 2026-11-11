export const OFFICIAL_SEAL_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageOfficialSealImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => OFFICIAL_SEAL_IMPORT_ROLES.has(name));
}
