import type { Task, UrgencyLevel } from '@/lib/api/project-management.types';
import type { ProjectDisciplineRow } from '@/lib/query/disciplines';
import type { DashboardChartData, DashboardChartDatum } from '@/lib/dashboard/types';
import { tokens } from '@/lib/theme/tokens';

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  VERY_URGENT: tokens.colorRed400,
  URGENT: tokens.colorAmber400,
  NORMAL: tokens.colorGreen400,
};

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  VERY_URGENT: 'Very Urgent (紧急)',
  URGENT: 'Urgent (急)',
  NORMAL: 'Normal (正常)',
};

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfWeek(date: Date): Date {
  // TODO: not connected to HR work schedule (ISO week start only)
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

function endOfWeek(date: Date): Date {
  const value = startOfWeek(date);
  value.setDate(value.getDate() + 6);
  return endOfDay(value);
}

function buildTaskTimelineChart(
  tasks: Task[],
  today: Date = new Date(),
): DashboardChartDatum[] {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  let currentWeek = 0;
  let plannedFuture = 0;

  for (const task of tasks) {
    const start = parseDate(task.startDate);
    const finish = parseDate(task.finishDate) ?? start;
    if (!start) {
      plannedFuture += 1;
      continue;
    }

    const effectiveEnd = finish ?? start;
    if (start.getTime() <= weekEnd.getTime() && effectiveEnd.getTime() >= weekStart.getTime()) {
      currentWeek += 1;
    } else if (start.getTime() > weekEnd.getTime()) {
      plannedFuture += 1;
    }
  }

  const total = currentWeek + plannedFuture;
  if (total === 0) {
    return [];
  }

  return [
    {
      name: 'Current Week',
      value: Math.round((currentWeek / total) * 100),
      color: tokens.colorTeal400,
    },
    {
      name: 'Planned (Future)',
      value: Math.round((plannedFuture / total) * 100),
      color: tokens.colorBlue400,
    },
  ];
}

function buildDisciplineWorkloadChart(
  disciplines: ProjectDisciplineRow[],
): DashboardChartDatum[] {
  const counts = new Map<string, number>();

  for (const row of disciplines) {
    if (row.isClosed) {
      continue;
    }
    counts.set(row.disciplineName, (counts.get(row.disciplineName) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));
}

function buildPriorityChart(tasks: Task[]): DashboardChartDatum[] {
  const counts: Record<UrgencyLevel, number> = {
    VERY_URGENT: 0,
    URGENT: 0,
    NORMAL: 0,
  };

  for (const task of tasks) {
    counts[task.urgencyLevel] += 1;
  }

  return (Object.keys(counts) as UrgencyLevel[])
    .map((level) => ({
      name: URGENCY_LABELS[level],
      value: counts[level],
      color: URGENCY_COLORS[level],
    }))
    .filter((entry) => entry.value > 0);
}

function buildCompletionRate(tasks: Task[]): number {
  if (tasks.length === 0) {
    return 0;
  }
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  return Math.round((completed / tasks.length) * 100);
}

/** Builds chart datasets from filtered portfolio tasks and disciplines. */
export function buildDashboardChartData(
  tasks: Task[],
  disciplines: ProjectDisciplineRow[],
): DashboardChartData {
  return {
    taskTimeline: buildTaskTimelineChart(tasks),
    disciplineWorkload: buildDisciplineWorkloadChart(disciplines),
    priorityBreakdown: buildPriorityChart(tasks),
    completionRate: buildCompletionRate(tasks),
  };
}
