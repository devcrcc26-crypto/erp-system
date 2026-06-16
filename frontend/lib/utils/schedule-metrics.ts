import type { Task } from '@/lib/api/project-management.types';

export interface ScheduleMetrics {
  taskCount: number;
  criticalCount: number;
  actualProgressPct: number | null;
  plannedProgressPct: number | null;
  scheduleVariancePct: number | null;
}

const MS_PER_DAY = 86_400_000;

function toDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY));
}

function computePlannedProgress(task: Task, today: Date): number | null {
  const start = toDate(task.startDate);
  const finish = toDate(task.finishDate);
  if (!start || !finish) {
    return null;
  }
  if (today <= start) {
    return 0;
  }
  if (today >= finish) {
    return 100;
  }
  const total = finish.getTime() - start.getTime();
  if (total <= 0) {
    return 100;
  }
  return clampPercent(((today.getTime() - start.getTime()) / total) * 100);
}

export function computeScheduleMetrics(tasks: Task[]): ScheduleMetrics {
  if (tasks.length === 0) {
    return {
      taskCount: 0,
      criticalCount: 0,
      actualProgressPct: null,
      plannedProgressPct: null,
      scheduleVariancePct: null,
    };
  }

  const today = new Date();
  const actualProgressPct = clampPercent(
    tasks.reduce((sum, task) => sum + task.progressPct, 0) / tasks.length,
  );

  const plannedValues = tasks
    .map((task) => computePlannedProgress(task, today))
    .filter((value): value is number => value !== null);

  const plannedProgressPct =
    plannedValues.length > 0
      ? clampPercent(
          plannedValues.reduce((sum, value) => sum + value, 0) /
            plannedValues.length,
        )
      : null;

  const scheduleVariancePct =
    plannedProgressPct !== null
      ? actualProgressPct - plannedProgressPct
      : null;

  return {
    taskCount: tasks.length,
    criticalCount: tasks.filter((task) => task.isCritical).length,
    actualProgressPct,
    plannedProgressPct,
    scheduleVariancePct,
  };
}

export interface GanttDateRange {
  start: Date;
  end: Date;
  totalDays: number;
}

export function getGanttDateRange(tasks: Task[]): GanttDateRange | null {
  const datedTasks = tasks.filter(
    (task) => task.startDate || task.finishDate,
  );
  if (datedTasks.length === 0) {
    return null;
  }

  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;

  for (const task of datedTasks) {
    const start = toDate(task.startDate) ?? toDate(task.finishDate);
    const finish = toDate(task.finishDate) ?? toDate(task.startDate);
    if (!start || !finish) {
      continue;
    }
    minTime = Math.min(minTime, start.getTime());
    maxTime = Math.max(maxTime, finish.getTime());
  }

  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime)) {
    return null;
  }

  const start = new Date(minTime);
  start.setDate(start.getDate() - 3);
  const end = new Date(maxTime);
  end.setDate(end.getDate() + 7);

  return {
    start,
    end,
    totalDays: daysBetween(start, end),
  };
}

export interface GanttBarLayout {
  leftPct: number;
  widthPct: number;
}

export function getGanttBarLayout(
  task: Task,
  range: GanttDateRange,
): GanttBarLayout | null {
  const start = toDate(task.startDate) ?? toDate(task.finishDate);
  const finish = toDate(task.finishDate) ?? toDate(task.startDate);
  if (!start || !finish) {
    return null;
  }

  const rangeMs = range.end.getTime() - range.start.getTime();
  if (rangeMs <= 0) {
    return null;
  }

  const leftPct =
    ((start.getTime() - range.start.getTime()) / rangeMs) * 100;
  const widthPct = Math.max(
    ((finish.getTime() - start.getTime()) / rangeMs) * 100,
    1.5,
  );

  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    widthPct: Math.max(1.5, Math.min(100 - leftPct, widthPct)),
  };
}

export function formatScheduleVariance(value: number | null): string {
  if (value === null) {
    return '—';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}%`;
}
