export const MATERIAL_REQUISITION_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageMaterialRequisitionImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => MATERIAL_REQUISITION_IMPORT_ROLES.has(name));
}
