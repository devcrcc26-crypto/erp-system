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

export interface TaskSubtaskTimelineSummary {
  computedPlannedFinish: string | null;
  computedActualFinish: string | null;
  allClosed: boolean;
}

/**
 * MAX planned finish and actual finish (when all closed) across subtasks.
 */
export function computeTaskSubtaskTimelineSummary(
  packages: Pick<
    DesignPackage,
    'plannedFinishDate' | 'packageClosedAt' | 'packageStatus'
  >[],
): TaskSubtaskTimelineSummary {
  if (packages.length === 0) {
    return {
      computedPlannedFinish: null,
      computedActualFinish: null,
      allClosed: false,
    };
  }

  const plannedDates = packages
    .map((pkg) => pkg.plannedFinishDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const computedPlannedFinish =
    plannedDates.length > 0 ? plannedDates[plannedDates.length - 1] : null;

  const allClosed = packages.every((pkg) => pkg.packageStatus === 'CLOSED');
  let computedActualFinish: string | null = null;
  if (allClosed) {
    const closedDates = packages
      .map((pkg) => pkg.packageClosedAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    computedActualFinish =
      closedDates.length > 0 ? closedDates[closedDates.length - 1] : null;
  }

  return {
    computedPlannedFinish,
    computedActualFinish,
    allClosed,
  };
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
 * EPC workspace path for a discipline (task discipline overview).
 */
export function scheduleDisciplineWorkspaceHref(
  projectId: string,
  taskDisciplineId: string,
): string {
  return `/projects/${projectId}/disciplines/${taskDisciplineId}`;
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

/**
 * Review mode path for a subtask (design package).
 */
export function reviewModeHref(
  projectId: string,
  taskDisciplineId: string,
  packageId: string,
  reviewSessionId?: string,
): string {
  const params = new URLSearchParams({
    projectId,
    disciplineId: taskDisciplineId,
  });
  if (reviewSessionId) {
    params.set('reviewSessionId', reviewSessionId);
  }
  return `/design-packages/${packageId}/review?${params.toString()}`;
}
