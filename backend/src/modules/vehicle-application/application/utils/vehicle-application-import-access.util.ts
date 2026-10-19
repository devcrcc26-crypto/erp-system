export const VEHICLE_APPLICATION_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageVehicleApplicationImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => VEHICLE_APPLICATION_IMPORT_ROLES.has(name));
}
