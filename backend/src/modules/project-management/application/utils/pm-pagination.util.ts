/**
 * Builds a Prisma orderBy clause constrained to allowed sort fields.
 */
export function buildPmOrderBy(
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  allowed: Set<string>,
  fallback = 'createdAt',
): Record<string, 'asc' | 'desc'> {
  const field = allowed.has(sortBy) ? sortBy : fallback;
  return { [field]: sortOrder };
}
