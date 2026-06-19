import type {
  DesignPackageItem,
  EdvStatus,
  EngineeringDocument,
} from '@/lib/api/epc.types';
import { formatEdvStatus } from '@/lib/utils/epc-display';

export interface PackageLockEligibility {
  eligible: boolean;
  reason: string | null;
}

export interface PackageEdvStatusSummary {
  draft: number;
  inReview: number;
  approved: number;
  locked: number;
  superseded: number;
  total: number;
}

export interface PackageLockGuidance extends PackageLockEligibility {
  nextStep: string | null;
  statusSummary: PackageEdvStatusSummary;
  inReviewEdvIds: string[];
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

function summarizeEdvStatuses(
  statuses: readonly (EdvStatus | undefined)[],
): PackageEdvStatusSummary {
  const summary: PackageEdvStatusSummary = {
    draft: 0,
    inReview: 0,
    approved: 0,
    locked: 0,
    superseded: 0,
    total: statuses.length,
  };

  for (const status of statuses) {
    switch (status) {
      case 'DRAFT':
        summary.draft += 1;
        break;
      case 'IN_REVIEW':
        summary.inReview += 1;
        break;
      case 'APPROVED':
        summary.approved += 1;
        break;
      case 'LOCKED':
        summary.locked += 1;
        break;
      case 'SUPERSEDED':
        summary.superseded += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

function formatStatusCounts(summary: PackageEdvStatusSummary): string {
  const parts: string[] = [];
  if (summary.draft > 0) {
    parts.push(`${summary.draft} Draft`);
  }
  if (summary.inReview > 0) {
    parts.push(`${summary.inReview} In Review`);
  }
  if (summary.approved > 0) {
    parts.push(`${summary.approved} Approved`);
  }
  if (summary.locked > 0) {
    parts.push(`${summary.locked} Locked`);
  }
  if (summary.superseded > 0) {
    parts.push(`${summary.superseded} Superseded`);
  }
  return parts.join(', ');
}

function resolveNextStep(
  summary: PackageEdvStatusSummary,
  hasReviewSession: boolean,
): string | null {
  if (summary.total === 0) {
    return 'Add engineering document versions to this package first.';
  }

  if (summary.draft > 0) {
    return 'Submit the package for review to move draft EDVs into review.';
  }

  if (summary.inReview > 0) {
    if (hasReviewSession) {
      return 'Approve each EDV in review mode, or use Approve all EDVs on this page.';
    }
    return 'Submit the package for review before EDVs can be approved.';
  }

  if (summary.approved > 0 && summary.approved < summary.total) {
    return 'Every package EDV must reach Approved before you can lock.';
  }

  if (summary.locked > 0 && summary.locked < summary.total) {
    return 'Some EDVs are already locked while others are still in an earlier state.';
  }

  return null;
}

/**
 * Mirrors backend `assertPackageLockEligible` for UI gating.
 */
export function getPackageLockEligibility(
  items: readonly DesignPackageItem[] | undefined,
  documents: readonly EngineeringDocument[],
): PackageLockEligibility {
  return getPackageLockGuidance(items, documents, false);
}

/**
 * Explains why lock is blocked and what to do next.
 */
export function getPackageLockGuidance(
  items: readonly DesignPackageItem[] | undefined,
  documents: readonly EngineeringDocument[],
  hasReviewSession: boolean,
): PackageLockGuidance {
  const packageItems = items ?? [];
  if (packageItems.length === 0) {
    return {
      eligible: false,
      reason: 'Add at least one EDV to the package before locking.',
      nextStep: 'Add engineering document versions to this package first.',
      statusSummary: summarizeEdvStatuses([]),
      inReviewEdvIds: [],
    };
  }

  const statusByEdvId = buildEdvStatusMap(documents);
  const statuses = packageItems.map((item) =>
    statusByEdvId.get(item.engineeringDocumentVersionId),
  );

  const statusSummary = summarizeEdvStatuses(statuses);
  const inReviewEdvIds = packageItems
    .filter(
      (item) =>
        statusByEdvId.get(item.engineeringDocumentVersionId) === 'IN_REVIEW',
    )
    .map((item) => item.engineeringDocumentVersionId);

  if (statuses.some((status) => !status)) {
    return {
      eligible: false,
      reason: 'Package references EDVs that could not be resolved.',
      nextStep: 'Refresh the page or re-link the missing engineering documents.',
      statusSummary,
      inReviewEdvIds,
    };
  }

  if (statuses.every((status) => status === 'APPROVED')) {
    return {
      eligible: true,
      reason: null,
      nextStep: null,
      statusSummary,
      inReviewEdvIds,
    };
  }

  const blockingStatuses = [
    ...new Set(
      statuses.filter((status) => status !== 'APPROVED').map(formatEdvStatus),
    ),
  ];

  return {
    eligible: false,
    reason: `All package EDVs must be Approved before locking. Current: ${formatStatusCounts(statusSummary)}.`,
    nextStep: resolveNextStep(statusSummary, hasReviewSession),
    statusSummary,
    inReviewEdvIds,
  };
}
