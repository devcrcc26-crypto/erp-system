import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';

type UserIdField = string;
type UserNameField = string;

function readUserId(row: object, idField: UserIdField): string | null | undefined {
  const value = (row as Record<string, string | null | undefined>)[idField];
  return typeof value === 'string' ? value : value ?? undefined;
}

/**
 * Loads a map of user id → display name for the given company.
 */
export async function loadUserDisplayNameMap(
  prisma: PrismaService,
  companyId: string,
  userIds: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      [...userIds].filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (ids.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids }, companyId },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      chineseName: true,
      email: true,
    },
  });

  return new Map(users.map((user) => [user.id, formatUserDisplayName(user)]));
}

/**
 * Attaches resolved display names to a row for the given id → name field pairs.
 */
export function withUserDisplayNames<T extends object>(
  row: T,
  nameMap: Map<string, string>,
  pairs: ReadonlyArray<[UserIdField, UserNameField]>,
): T {
  const enriched: Record<string, unknown> = {
    ...(row as Record<string, unknown>),
  };
  for (const [idField, nameField] of pairs) {
    const userId = readUserId(row, idField);
    enriched[nameField] =
      typeof userId === 'string' ? (nameMap.get(userId) ?? null) : null;
  }
  return enriched as T;
}

/**
 * Enriches a single row with user display name fields.
 */
export async function enrichWithUserDisplayNames<T extends object>(
  prisma: PrismaService,
  companyId: string,
  row: T,
  pairs: ReadonlyArray<[UserIdField, UserNameField]>,
): Promise<T> {
  const userIds = pairs.map(([idField]) => readUserId(row, idField));
  const nameMap = await loadUserDisplayNameMap(prisma, companyId, userIds);
  return withUserDisplayNames(row, nameMap, pairs);
}

/**
 * Batch-enriches rows with user display name fields.
 */
export async function enrichRowsWithUserDisplayNames<T extends object>(
  prisma: PrismaService,
  companyId: string,
  rows: T[],
  pairs: ReadonlyArray<[UserIdField, UserNameField]>,
): Promise<T[]> {
  if (rows.length === 0) {
    return rows;
  }

  const userIds: (string | null | undefined)[] = [];
  for (const row of rows) {
    for (const [idField] of pairs) {
      userIds.push(readUserId(row, idField));
    }
  }

  const nameMap = await loadUserDisplayNameMap(prisma, companyId, userIds);
  return rows.map((row) => withUserDisplayNames(row, nameMap, pairs));
}
