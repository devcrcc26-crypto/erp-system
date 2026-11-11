export const INSPECTION_REPAIR_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageInspectionRepairImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => INSPECTION_REPAIR_IMPORT_ROLES.has(name));
}
