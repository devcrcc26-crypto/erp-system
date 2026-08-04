import { PermissionFlags } from './permission.types';

export const SYSTEM_ADMINISTRATOR_ROLE = 'System Administrator';
export const PROJECT_ADMINISTRATOR_ROLE = 'Project Administrator';

/** Roles that receive unrestricted system-wide access. */
const FULL_ACCESS_ROLES = new Set([
  SYSTEM_ADMINISTRATOR_ROLE,
  PROJECT_ADMINISTRATOR_ROLE,
]);

/** HR modules — Project Administrator does not receive these via full-access bypass. */
export const PROJECT_ADMIN_EXCLUDED_MODULES = new Set([
  'hr',
  'leave',
  'overtime',
  'flight',
  'business-trip',
]);

export const FULL_PERMISSION_FLAGS: PermissionFlags = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canExport: true,
};

/**
 * Returns true when the user holds a full-access role
 * (System Administrator or Project Administrator).
 */
export function isSystemAdministrator(roleNames: readonly string[]): boolean {
  return roleNames.some((name) => FULL_ACCESS_ROLES.has(name));
}

/**
 * Returns true when the user holds System Administrator (not merely Project Admin).
 */
export function isTrueSystemAdministrator(
  roleNames: readonly string[],
): boolean {
  return roleNames.includes(SYSTEM_ADMINISTRATOR_ROLE);
}

/**
 * Returns true when the user holds Project Administrator.
 */
export function isProjectAdministrator(roleNames: readonly string[]): boolean {
  return roleNames.includes(PROJECT_ADMINISTRATOR_ROLE);
}
