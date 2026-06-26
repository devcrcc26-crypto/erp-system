import { EdvStatus } from './contracts/enums/edv-status.enum';
import { DesignPackageProjectedStatus } from './contracts/enums/design-package-projected-status.enum';

export interface PackageStatusInput {
  readonly edvStatuses: readonly EdvStatus[];
  readonly reworkRequired?: boolean;
  /** Active governance session - EDV APPROVED does not mean package is lead-ready yet. */
  readonly activeGovernanceSession?: boolean;
}

/**
 * Priority order - worst case wins when aggregating at discipline level.
 * Index 0 = highest severity.
 */
export const PACKAGE_STATUS_PRIORITY: readonly DesignPackageProjectedStatus[] =
  [
    DesignPackageProjectedStatus.REWORK_REQUIRED,
    DesignPackageProjectedStatus.IN_PROGRESS,
    DesignPackageProjectedStatus.PENDING_LEAD,
    DesignPackageProjectedStatus.LOCKED,
    DesignPackageProjectedStatus.APPROVED,
  ];

/**
 * Derives DesignPackage.projectedStatus from child EDV statuses.
 *
 * Rules (first match wins):
 * 1. reworkRequired flag                        → REWORK_REQUIRED
 * 2. any EDV in DRAFT or IN_REVIEW              → IN_PROGRESS
 * 3. all EDV = APPROVED                         → PENDING_LEAD
 * 4. all EDV = LOCKED                            → LOCKED
 * 5. all EDV = LOCKED or APPROVED (mix)         → APPROVED
 * 6. empty package                              → IN_PROGRESS
 *
 * When activeGovernanceSession is true, premature EDV APPROVED stays IN_PROGRESS
 * until the review session closes at the final tier.
 */
export function resolvePackageProjectedStatus(
  input: PackageStatusInput,
): DesignPackageProjectedStatus {
  const {
    edvStatuses,
    reworkRequired = false,
    activeGovernanceSession = false,
  } = input;

  if (reworkRequired) {
    return DesignPackageProjectedStatus.REWORK_REQUIRED;
  }

  if (edvStatuses.length === 0) {
    return DesignPackageProjectedStatus.IN_PROGRESS;
  }

  if (
    edvStatuses.some(
      (s) => s === EdvStatus.DRAFT || s === EdvStatus.IN_REVIEW,
    )
  ) {
    return DesignPackageProjectedStatus.IN_PROGRESS;
  }

  if (edvStatuses.every((s) => s === EdvStatus.APPROVED)) {
    if (activeGovernanceSession) {
      return DesignPackageProjectedStatus.IN_PROGRESS;
    }
    return DesignPackageProjectedStatus.PENDING_LEAD;
  }

  if (edvStatuses.every((s) => s === EdvStatus.LOCKED)) {
    return DesignPackageProjectedStatus.LOCKED;
  }

  if (
    edvStatuses.every(
      (s) => s === EdvStatus.LOCKED || s === EdvStatus.APPROVED,
    )
  ) {
    return DesignPackageProjectedStatus.APPROVED;
  }

  if (edvStatuses.some((s) => s === EdvStatus.SUPERSEDED)) {
    const activeStatuses = edvStatuses.filter(
      (s) => s !== EdvStatus.SUPERSEDED,
    );
    if (activeStatuses.length === 0) {
      return DesignPackageProjectedStatus.IN_PROGRESS;
    }
    return resolvePackageProjectedStatus({
      edvStatuses: activeStatuses,
      reworkRequired: false,
    });
  }

  return DesignPackageProjectedStatus.IN_PROGRESS;
}

/**
 * Returns the more severe of two package projected statuses.
 */
export function worstPackageStatus(
  a: DesignPackageProjectedStatus,
  b: DesignPackageProjectedStatus,
): DesignPackageProjectedStatus {
  const indexA = PACKAGE_STATUS_PRIORITY.indexOf(a);
  const indexB = PACKAGE_STATUS_PRIORITY.indexOf(b);
  return indexA <= indexB ? a : b;
}
