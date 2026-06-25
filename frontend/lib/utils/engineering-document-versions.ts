import type { EngineeringDocumentVersion } from '@/lib/api/epc.types';

/**
 * Returns the most recently created EDV regardless of API sort order.
 */
export function getLatestEngineeringDocumentVersion<
  T extends Pick<EngineeringDocumentVersion, 'createdAt'>,
>(versions: readonly T[] | undefined): T | undefined {
  if (!versions?.length) {
    return undefined;
  }

  return [...versions].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];
}
