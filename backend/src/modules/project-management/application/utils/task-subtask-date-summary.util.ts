/**
 * Calendar days between two dates (inclusive-style ceil, matching subtask close logic).
 */
export function computeCalendarDaysBetween(
  start: Date,
  finish: Date,
): number {
  return Math.ceil(
    (finish.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Planned work days from subtask planned start → planned finish.
 */
export function computePlannedWorkDays(
  plannedStartDate: Date | null,
  plannedFinishDate: Date | null,
): number | null {
  if (!plannedStartDate || !plannedFinishDate) {
    return null;
  }
  const days = computeCalendarDaysBetween(plannedStartDate, plannedFinishDate);
  return days >= 0 ? days : null;
}

export interface TaskSubtaskWorkDaysSummary {
  computedPlannedWorkDays: number | null;
  computedActualWorkDays: number | null;
}

export interface SubtaskWorkDaysRow {
  taskId: string;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  actualWorkDays: number | null;
  /** Only CLOSED subtasks contribute to task actual work days. */
  packageStatus: string;
}

const EMPTY_SUMMARY: TaskSubtaskWorkDaysSummary = {
  computedPlannedWorkDays: null,
  computedActualWorkDays: null,
};

/**
 * Sums planned work days (start→finish per subtask) and actual work days per task.
 */
export function buildTaskSubtaskWorkDaysSummaries(
  taskIds: readonly string[],
  rows: readonly SubtaskWorkDaysRow[],
): Map<string, TaskSubtaskWorkDaysSummary> {
  const byTaskId = new Map<string, SubtaskWorkDaysRow[]>();
  for (const row of rows) {
    const existing = byTaskId.get(row.taskId) ?? [];
    existing.push(row);
    byTaskId.set(row.taskId, existing);
  }

  const summaryByTaskId = new Map<string, TaskSubtaskWorkDaysSummary>();
  for (const taskId of taskIds) {
    const pkgs = byTaskId.get(taskId) ?? [];
    if (pkgs.length === 0) {
      summaryByTaskId.set(taskId, EMPTY_SUMMARY);
      continue;
    }

    let plannedSum = 0;
    let hasPlanned = false;
    for (const pkg of pkgs) {
      const days = computePlannedWorkDays(
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
    const allClosed =
      pkgs.length > 0 && pkgs.every((pkg) => pkg.packageStatus === 'CLOSED');
    if (allClosed) {
      for (const pkg of pkgs) {
        if (pkg.actualWorkDays !== null) {
          actualSum += pkg.actualWorkDays;
          hasActual = true;
        }
      }
    }

    summaryByTaskId.set(taskId, {
      computedPlannedWorkDays: hasPlanned ? plannedSum : null,
      computedActualWorkDays: hasActual ? actualSum : null,
    });
  }

  return summaryByTaskId;
}
