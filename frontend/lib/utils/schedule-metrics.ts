import type { Task } from '@/lib/api/project-management.types';
import type { ScheduleSubtaskEntry } from '@/lib/query/schedule';
import { computeScheduleSubtaskRollup } from './schedule-subtasks';

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

/**
 * Inclusive calendar-day duration between task start and finish dates.
 */
export function calculateTaskDurationDays(
  startDate: string | Date | null | undefined,
  finishDate: string | Date | null | undefined,
): number | null {
  const start = toDate(
    startDate instanceof Date ? startDate.toISOString() : (startDate ?? null),
  );
  const finish = toDate(
    finishDate instanceof Date ? finishDate.toISOString() : (finishDate ?? null),
  );
  if (!start || !finish) {
    return null;
  }

  const startDay = startOfDay(start);
  const finishDay = startOfDay(finish);
  if (finishDay < startDay) {
    return null;
  }

  return (
    Math.floor((finishDay.getTime() - startDay.getTime()) / MS_PER_DAY) + 1
  );
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

/**
 * Task progress derived from subtask (design package) completion: closed/total,
 * rounded. Returns null when the task has no subtasks (no computable progress).
 */
export function computeTaskProgressPct(
  subtasks: readonly ScheduleSubtaskEntry[],
): number | null {
  const rollup = computeScheduleSubtaskRollup(
    subtasks.map((entry) => entry.package),
  );
  if (!rollup || rollup.total === 0) {
    return null;
  }
  return clampPercent((rollup.closed / rollup.total) * 100);
}

export function computeScheduleMetrics(
  tasks: Task[],
  subtasksByTaskId: ReadonlyMap<string, ScheduleSubtaskEntry[]>,
): ScheduleMetrics {
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
  const progressValues = tasks
    .map((task) => computeTaskProgressPct(subtasksByTaskId.get(task.id) ?? []))
    .filter((value): value is number => value !== null);
  const actualProgressPct =
    progressValues.length > 0
      ? clampPercent(
          progressValues.reduce((sum, value) => sum + value, 0) /
            progressValues.length,
        )
      : null;

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
    plannedProgressPct !== null && actualProgressPct !== null
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

export const GANTT_DAY_WIDTH_PX = 40;
export const GANTT_ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
export const GANTT_DEFAULT_ZOOM_INDEX = 2;
export const GANTT_TASK_COLUMN_PX = 280;
export const GANTT_HEADER_HEIGHT_PX = 80;
export const GANTT_ROW_HEIGHT_PX = 72;
export const GANTT_BAR_MIN_WIDTH_PX = 28;
export const GANTT_BAR_HEIGHT_PX = 36;

export interface GanttTimelineMonth {
  key: string;
  label: string;
  startDay: number;
  dayCount: number;
}

export interface GanttTimelineWeek {
  key: string;
  label: string;
  startDay: number;
  dayCount: number;
}

export interface GanttTimeline {
  months: GanttTimelineMonth[];
  weeks: GanttTimelineWeek[];
  totalWidthPx: number;
  todayDayIndex: number | null;
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

/** Builds month/week header segments and pixel width for the Gantt timeline. */
export function buildGanttTimeline(
  range: GanttDateRange,
  dayWidthPx: number = GANTT_DAY_WIDTH_PX,
): GanttTimeline {
  const totalWidthPx = range.totalDays * dayWidthPx;
  const rangeStart = startOfDay(range.start);
  const rangeEnd = startOfDay(range.end);

  const months: GanttTimelineMonth[] = [];
  let monthCursor = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    1,
  );

  while (monthCursor <= rangeEnd) {
    const monthStart =
      monthCursor < rangeStart ? rangeStart : startOfDay(monthCursor);
    const nextMonth = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth() + 1,
      1,
    );
    const monthEnd =
      addDays(nextMonth, -1) <= rangeEnd
        ? addDays(nextMonth, -1)
        : rangeEnd;
    const startDay = Math.floor(
      (monthStart.getTime() - rangeStart.getTime()) / MS_PER_DAY,
    );
    const endDay = Math.floor(
      (monthEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY,
    );

    months.push({
      key: `${monthCursor.getFullYear()}-${monthCursor.getMonth()}`,
      label: monthCursor.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
      startDay,
      dayCount: endDay - startDay + 1,
    });

    monthCursor = nextMonth;
  }

  const weeks: GanttTimelineWeek[] = [];
  for (let day = 0; day < range.totalDays; day += 7) {
    const weekStart = addDays(rangeStart, day);
    weeks.push({
      key: `week-${day}`,
      label: weekStart.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      startDay: day,
      dayCount: Math.min(7, range.totalDays - day),
    });
  }

  const today = startOfDay(new Date());
  const todayDayIndex =
    today >= rangeStart && today <= rangeEnd
      ? Math.floor((today.getTime() - rangeStart.getTime()) / MS_PER_DAY)
      : null;

  return {
    months,
    weeks,
    totalWidthPx,
    todayDayIndex,
  };
}

export function getGanttBarLayoutPx(
  task: Task,
  range: GanttDateRange,
  dayWidthPx: number = GANTT_DAY_WIDTH_PX,
): { leftPx: number; widthPx: number } | null {
  const layout = getGanttBarLayout(task, range);
  if (!layout) {
    return null;
  }

  return {
    leftPx: (layout.leftPct / 100) * range.totalDays * dayWidthPx,
    widthPx: Math.max(
      (layout.widthPct / 100) * range.totalDays * dayWidthPx,
      GANTT_BAR_MIN_WIDTH_PX,
    ),
  };
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
    return '-';
  }
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}%`;
}
