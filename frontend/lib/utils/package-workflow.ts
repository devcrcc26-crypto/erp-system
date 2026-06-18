import type {
  DesignPackageItem,
  EdvStatus,
  EngineeringDocument,
} from '@/lib/api/epc.types';

export interface PackageLockEligibility {
  eligible: boolean;
  reason: string | null;
}

function buildEdvStatusMap(
  documents: readonly EngineeringDocument[],
): Map<string, EdvStatus> {
  const statusByEdvId = new Map<string, EdvStatus>();
  for (const document of documents) {
    for (const version of document.versions ?? []) {
      statusByEdvId.set(version.id, version.status);
    }
  }
  return statusByEdvId;
}

/**
 * Mirrors backend `assertPackageLockEligible` for UI gating.
 */
export function getPackageLockEligibility(
  items: readonly DesignPackageItem[] | undefined,
  documents: readonly EngineeringDocument[],
): PackageLockEligibility {
  const packageItems = items ?? [];
  if (packageItems.length === 0) {
    return {
      eligible: false,
      reason: 'Add at least one EDV to the package before locking.',
    };
  }

  const statusByEdvId = buildEdvStatusMap(documents);
  const statuses = packageItems.map(
    (item) => statusByEdvId.get(item.engineeringDocumentVersionId),
  );

  if (statuses.some((status) => !status)) {
    return {
      eligible: false,
      reason: 'Package references EDVs that could not be resolved.',
    };
  }

  if (statuses.some((status) => status !== 'APPROVED')) {
    return {
      eligible: false,
      reason: 'All package EDVs must be APPROVED before locking.',
    };
  }

  return { eligible: true, reason: null };
}
