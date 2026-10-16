/** Returns the manager id of a user (null/undefined when they report to nobody). */
export type ManagerLookup = (
  userId: string,
) => string | null | undefined | Promise<string | null | undefined>;

/** Hard stop for corrupt chains that loop without passing through the subject. */
const MAX_CHAIN_DEPTH = 1000;

/**
 * Checks whether making `userId` report to `newManagerId` would create a
 * reporting cycle. Walks up from the new manager; reaching `userId` means a cycle.
 *
 * Returns the cycle as user ids - `[userId, newManagerId, …, userId]` - or null.
 * A loop above the subject that never reaches it is not reported here (the subject
 * does not take part in it); the walk simply stops.
 */
export async function findReportsToCycle(
  userId: string,
  newManagerId: string | null | undefined,
  getManager: ManagerLookup,
): Promise<string[] | null> {
  if (!newManagerId) {
    return null;
  }
  if (newManagerId === userId) {
    return [userId, userId];
  }

  const path = [userId, newManagerId];
  const seen = new Set<string>([newManagerId]);
  let current: string | null | undefined = newManagerId;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH && current; depth += 1) {
    const next: string | null | undefined = await getManager(current);
    if (!next) {
      return null;
    }
    path.push(next);
    if (next === userId) {
      return path;
    }
    if (seen.has(next)) {
      return null;
    }
    seen.add(next);
    current = next;
  }
  return null;
}
