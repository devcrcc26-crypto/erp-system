import { PermissionFlags } from './permission.types';

export const SYSTEM_ADMINISTRATOR_ROLE = 'System Administrator';

export const FULL_PERMISSION_FLAGS: PermissionFlags = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canExport: true,
};

/**
 * Returns true when the user holds the System Administrator role.
 */
export function isSystemAdministrator(roleNames: readonly string[]): boolean {
  return roleNames.includes(SYSTEM_ADMINISTRATOR_ROLE);
}
