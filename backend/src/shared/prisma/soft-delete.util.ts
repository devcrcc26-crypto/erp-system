/**
 * Standard active-record filter for soft-deleted entities.
 * Repository layer must apply this on all read queries per .cursorrules.
 */
export function activeOnly<T extends { deletedAt?: Date | null }>(
  where: T = {} as T,
): T & { deletedAt: null } {
  return { ...where, deletedAt: null };
}
