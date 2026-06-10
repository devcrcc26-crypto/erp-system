/**
 * Standard active-record filter for soft-deleted entities.
 * Repository layer must apply this on all read queries per .cursorrules.
 */
export function activeOnly<T extends Record<string, unknown>>(
  where: T,
): T & { deletedAt: null } {
  return { ...where, deletedAt: null };
}
