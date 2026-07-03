import type { User } from '@/lib/api/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the value looks like a UUID (raw ids should not be shown in UI).
 */
export function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Prefer API-resolved name, then directory lookup, never raw UUIDs.
 */
export function displayUserLabel(
  userId: string | null | undefined,
  resolvedName?: string | null,
  emptyLabel = 'Unassigned',
): string {
  if (resolvedName?.trim()) {
    return resolvedName;
  }
  if (!userId) {
    return emptyLabel;
  }
  return 'Unknown user';
}

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
  const contact = user.email ? ` (${user.email})` : '';
  return `${user.firstName} ${user.lastName} — ${roles}${contact}`;
}
