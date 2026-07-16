import type { EngineeringDocumentVersion } from '@/lib/api/epc.types';

/**
 * Returns the current EDV when marked, otherwise the most recently created version.
 */
export function getLatestEngineeringDocumentVersion<
  T extends Pick<EngineeringDocumentVersion, 'createdAt'> & {
    isCurrent?: boolean;
  },
>(versions: readonly T[] | undefined): T | undefined {
  if (!versions?.length) {
    return undefined;
  }

  const current = versions.find((version) => version.isCurrent === true);
  if (current) {
    return current;
  }

  return [...versions].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0];
}
