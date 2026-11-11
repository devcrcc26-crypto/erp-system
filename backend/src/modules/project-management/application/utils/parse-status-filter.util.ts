/**
 * Parses a single status or comma-separated list into a Prisma equality / `in` filter.
 */
export function parseStatusFilter<T extends string>(
  status: string | undefined,
): T | { in: T[] } | undefined {
  if (!status?.trim()) {
    return undefined;
  }

  const statuses = status
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => value.length > 0);

  if (statuses.length === 0) {
    return undefined;
  }

  if (statuses.length === 1) {
    return statuses[0];
  }

  return { in: statuses };
}
