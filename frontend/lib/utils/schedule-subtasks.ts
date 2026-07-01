import type { DesignPackage } from '@/lib/api/epc.types';

/** Schedule-facing subtask status labels (design packages shown as subtasks). */
export type ScheduleSubtaskDisplayStatus =
  | 'OPEN'
  | 'IN REVIEW'
  | 'APPROVED'
  | 'LOCKED'
  | 'CLOSED';

export interface ScheduleSubtaskRollup {
  closed: number;
  total: number;
}

/**
 * Maps a design package to a simplified status for the schedule task list.
 */
export function getScheduleSubtaskDisplayStatus(
  pkg: Pick<DesignPackage, 'packageStatus' | 'projectedStatus'>,
): ScheduleSubtaskDisplayStatus {
  if (pkg.packageStatus === 'CLOSED') {
    return 'CLOSED';
  }
  if (pkg.projectedStatus === 'LOCKED') {
    return 'LOCKED';
  }
  if (pkg.projectedStatus === 'APPROVED') {
    return 'APPROVED';
  }
  if (
    pkg.packageStatus === 'SUBMITTED' ||
    pkg.projectedStatus === 'PENDING_LEAD'
  ) {
    return 'IN REVIEW';
  }
  return 'OPEN';
}

/**
 * Returns closed/total counts for subtask progress on a parent task row.
 */
export function computeScheduleSubtaskRollup(
  packages: Pick<DesignPackage, 'packageStatus'>[],
): ScheduleSubtaskRollup | null {
  if (packages.length === 0) {
    return null;
  }
  const closed = packages.filter((pkg) => pkg.packageStatus === 'CLOSED').length;
  return { closed, total: packages.length };
}

/**
 * EPC workspace path for a subtask (design package).
 */
export function scheduleSubtaskWorkspaceHref(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
): string {
  return `/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${packageId}`;
}
