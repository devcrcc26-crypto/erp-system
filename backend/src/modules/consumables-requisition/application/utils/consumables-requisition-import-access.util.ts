export const CONSUMABLES_REQUISITION_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageConsumablesRequisitionImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => CONSUMABLES_REQUISITION_IMPORT_ROLES.has(name));
}
