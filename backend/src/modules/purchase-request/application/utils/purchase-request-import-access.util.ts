export const PURCHASE_REQUEST_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManagePurchaseRequestImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => PURCHASE_REQUEST_IMPORT_ROLES.has(name));
}
