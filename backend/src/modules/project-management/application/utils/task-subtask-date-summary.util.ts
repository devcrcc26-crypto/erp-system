import { DesignPackageStatus } from '@prisma/client';
import { toDateString } from './pm-mapper.util';

export interface TaskSubtaskDateSummary {
  computedPlannedFinish: string | null;
  computedActualFinish: string | null;
}

export interface SubtaskDateRow {
  taskId: string;
  plannedFinishDate: Date | null;
  packageClosedAt: Date | null;
  packageStatus: DesignPackageStatus;
}

const EMPTY_SUMMARY: TaskSubtaskDateSummary = {
  computedPlannedFinish: null,
  computedActualFinish: null,
};

/**
 * Derives task-level planned/actual finish from subtask design packages.
 */
export function buildTaskSubtaskDateSummaries(
  taskIds: readonly string[],
  rows: readonly SubtaskDateRow[],
): Map<string, TaskSubtaskDateSummary> {
  const byTaskId = new Map<string, SubtaskDateRow[]>();
  for (const row of rows) {
    const existing = byTaskId.get(row.taskId) ?? [];
    existing.push(row);
    byTaskId.set(row.taskId, existing);
  }

  const summaryByTaskId = new Map<string, TaskSubtaskDateSummary>();
  for (const taskId of taskIds) {
    const pkgs = byTaskId.get(taskId) ?? [];
    if (pkgs.length === 0) {
      summaryByTaskId.set(taskId, EMPTY_SUMMARY);
      continue;
    }

    const plannedDates = pkgs
      .map((pkg) => pkg.plannedFinishDate)
      .filter((value): value is Date => value !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    const computedPlannedFinish =
      plannedDates.length > 0
        ? toDateString(plannedDates[plannedDates.length - 1])
        : null;

    const allClosed = pkgs.every(
      (pkg) => pkg.packageStatus === DesignPackageStatus.CLOSED,
    );
    let computedActualFinish: string | null = null;
    if (allClosed) {
      const closedDates = pkgs
        .map((pkg) => pkg.packageClosedAt)
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      computedActualFinish =
        closedDates.length > 0
          ? toDateString(closedDates[closedDates.length - 1])
          : null;
    }

    summaryByTaskId.set(taskId, {
      computedPlannedFinish,
      computedActualFinish,
    });
  }

  return summaryByTaskId;
}
