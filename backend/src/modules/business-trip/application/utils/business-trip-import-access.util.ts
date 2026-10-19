export const BUSINESS_TRIP_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageBusinessTripImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => BUSINESS_TRIP_IMPORT_ROLES.has(name));
}
