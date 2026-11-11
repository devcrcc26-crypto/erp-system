export const VEHICLE_REFUELING_IMPORT_ROLES: ReadonlySet<string> = new Set([
  'System Administrator',
  'HR Manager',
  'HR Officer',
  'HR Assistant',
]);

export function canManageVehicleRefuelingImport(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => VEHICLE_REFUELING_IMPORT_ROLES.has(name));
}
