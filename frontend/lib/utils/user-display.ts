import type { User } from '@/lib/api/types';

/**
 * Comma-separated system role names for a user.
 */
export function formatUserRoleNames(user: User): string {
  const names =
    user.userRoles
      ?.map((assignment) => assignment.role.name)
      .filter((name) => name.length > 0) ?? [];

  return names.length > 0 ? names.join(', ') : 'No role assigned';
}

/**
 * Label for user pickers — name, roles, and email.
 */
export function formatUserPickerLabel(user: User): string {
  const roles = formatUserRoleNames(user);
  return `${user.firstName} ${user.lastName} — ${roles} (${user.email})`;
}
