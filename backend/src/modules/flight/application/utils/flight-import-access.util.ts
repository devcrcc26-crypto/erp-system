export const FLIGHT_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageFlightImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => FLIGHT_IMPORT_ROLES.has(name));
}
