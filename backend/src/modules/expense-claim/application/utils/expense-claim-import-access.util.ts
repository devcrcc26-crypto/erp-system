export const EXPENSE_CLAIM_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
]);

export function canManageExpenseClaimImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => EXPENSE_CLAIM_IMPORT_ROLES.has(name));
}
