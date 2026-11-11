/**
 * Roles allowed to perform bulk employee-contract imports.
 */
export const CONTRACT_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageContractImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => CONTRACT_IMPORT_ROLES.has(name));
}
