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
 * Full display name including the Chinese name when present, e.g. "Wei Zhang (张伟)".
 * Falls back to the Chinese name alone, then email, then "Unknown user".
 */
export function formatUserName(user: {
  firstName?: string | null;
  lastName?: string | null;
  chineseName?: string | null;
  email?: string | null;
}): string {
  const english = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const chinese = user.chineseName?.trim();

  if (english && chinese) {
    return `${english} (${chinese})`;
  }
  if (english) {
    return english;
  }
  if (chinese) {
    return chinese;
  }
  return user.email?.trim() || 'Unknown user';
}

/**
 * Engineering discipline name, or "Not Assigned" when the user has none.
 */
export function formatUserDiscipline(user: {
  engineeringDiscipline?: { name: string } | null;
}): string {
  return user.engineeringDiscipline?.name?.trim() || 'Not Assigned';
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
 * Label for user pickers — name, roles, and discipline.
 */
export function formatUserPickerLabel(user: User): string {
  return `${formatUserName(user)} (${formatUserDiscipline(user)})`;
}
