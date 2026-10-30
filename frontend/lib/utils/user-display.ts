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
  middleName?: string | null;
  lastName?: string | null;
  chineseName?: string | null;
  email?: string | null;
}): string {
  const english = [user.firstName, user.middleName, user.lastName]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Display priority for header / avatar role label (lower index = higher rank).
 */
const ROLE_DISPLAY_PRIORITY: readonly string[] = [
  'System Administrator',
  'Managing Director',
  'General Manager',
  'Project Director',
  'Project Administrator',
  'Project Manager',
  'Chief Engineer',
  'Institute Chief',
  'Deputy Chief',
  'Department Chief',
  'Finance Manager',
  'HR Officer',
  'Procurement Officer',
  'Document Controller',
  'Planning Engineer',
  'Discipline Lead',
  'Discipline Owner',
  'Site Coordinator',
  'Site Engineer',
  'Designer',
  'Reviewer',
  'Dispatcher',
  'Accountant',
  'Storekeeper',
  'Safety Officer',
  'Client Consultant',
  'Employee',
];

/**
 * Picks the single highest-ranking role name for compact UI (e.g. header avatar).
 * Prefers an assignment marked isPrimary when present.
 */
export function pickTopLevelRoleName(
  roles: readonly { name: string; isPrimary?: boolean }[] | null | undefined,
  emptyLabel = 'No role assigned',
): string {
  if (!roles || roles.length === 0) {
    return emptyLabel;
  }

  const primary = roles.find((role) => role.isPrimary === true);
  if (primary?.name?.trim()) {
    return primary.name.trim();
  }

  let bestName = roles[0]?.name ?? emptyLabel;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const role of roles) {
    const name = role.name?.trim();
    if (!name) {
      continue;
    }
    const index = ROLE_DISPLAY_PRIORITY.indexOf(name);
    const rank = index === -1 ? ROLE_DISPLAY_PRIORITY.length : index;
    if (rank < bestRank) {
      bestRank = rank;
      bestName = name;
    }
  }

  return bestName;
}

/**
 * Label for user pickers - name, roles, and discipline.
 */
export function formatUserPickerLabel(user: User): string {
  return `${formatUserName(user)} (${formatUserDiscipline(user)})`;
}

/**
 * Employee filter options built from list rows (one per person, sorted by
 * name). Supervisors filter their team list this way without needing the
 * company user directory. `person` picks who a row is about (default
 * `row.employee`; travel lists use the submitter).
 */
type ListPerson = Parameters<typeof formatUserName>[0] & { id: string };

export function teamEmployeeOptions<T>(
  rows: readonly T[],
  person: (row: T) => ListPerson | null | undefined = (row) =>
    (row as { employee?: ListPerson | null }).employee,
): { value: string; label: string }[] {
  const byId = new Map<string, string>();
  for (const row of rows) {
    const who = person(row);
    if (who && !byId.has(who.id)) {
      byId.set(who.id, formatUserName(who));
    }
  }
  return [...byId]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
