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
  totalPlannedWorkDays: number | null;
  totalActualWorkDays: number | null;
}

/**
 * Calendar days between two date strings (YYYY-MM-DD or ISO).
 */
export function computePlannedWorkDaysFromDates(
  plannedStartDate: string | null | undefined,
  plannedFinishDate: string | null | undefined,
): number | null {
  if (!plannedStartDate || !plannedFinishDate) {
    return null;
  }
  const start = new Date(plannedStartDate);
  const finish = new Date(plannedFinishDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
    return null;
  }
  const days = Math.ceil(
    (finish.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return days >= 0 ? days : null;
}

/**
 * Sums planned work days (start→finish per subtask) and actual work days.
 */
export function computeTaskSubtaskWorkDaysSummary(
  packages: Pick<
    DesignPackage,
    | 'plannedStartDate'
    | 'plannedFinishDate'
    | 'actualWorkDays'
    | 'packageStatus'
  >[],
): TaskSubtaskTimelineSummary {
  if (packages.length === 0) {
    return {
      totalPlannedWorkDays: null,
      totalActualWorkDays: null,
    };
  }

  let plannedSum = 0;
  let hasPlanned = false;
  for (const pkg of packages) {
    const days = computePlannedWorkDaysFromDates(
      pkg.plannedStartDate,
      pkg.plannedFinishDate,
    );
    if (days !== null) {
      plannedSum += days;
      hasPlanned = true;
    }
  }

  let actualSum = 0;
  let hasActual = false;
  const allClosed = packages.every((pkg) => pkg.packageStatus === 'CLOSED');
  if (allClosed) {
    for (const pkg of packages) {
      if (pkg.actualWorkDays != null) {
        actualSum += pkg.actualWorkDays;
        hasActual = true;
      }
    }
  }

  return {
    totalPlannedWorkDays: hasPlanned ? plannedSum : null,
    totalActualWorkDays: hasActual ? actualSum : null,
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
  options?: {
    readOnly?: boolean;
    actionTaken?: 'APPROVED' | 'RETURNED' | null;
    actionTakenAt?: string | null;
  },
): string {
  const params = new URLSearchParams({
    projectId,
    disciplineId: taskDisciplineId,
  });
  if (reviewSessionId) {
    params.set('reviewSessionId', reviewSessionId);
  }
  if (options?.readOnly) {
    params.set('readOnly', 'true');
  }
  if (options?.actionTaken) {
    params.set('actionTaken', options.actionTaken.toLowerCase());
  }
  if (options?.actionTakenAt) {
    params.set('actionTakenAt', options.actionTakenAt);
  }
  return `/design-packages/${packageId}/review?${params.toString()}`;
}
