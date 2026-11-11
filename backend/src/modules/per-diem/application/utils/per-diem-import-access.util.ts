export const PER_DIEM_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManagePerDiemImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => PER_DIEM_IMPORT_ROLES.has(name));
}
