import type { Task } from '@/lib/api/project-management.types';
import type { ProjectDisciplineRow } from '@/lib/query/disciplines';
import type { DashboardDateRange, DashboardFilters } from '@/lib/dashboard/types';

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

function startOfMonth(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Resolves inclusive calendar bounds for a dashboard date-range preset. */
export function getDashboardDateRangeBounds(
  range: DashboardDateRange,
  referenceDate: Date = new Date(),
): { start: Date | null; end: Date | null } {
  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);

  switch (range) {
    case 'ALL_TIME':
      return { start: null, end: null };
    case 'THIS_WEEK':
      return { start: startOfWeek(referenceDate), end: endOfWeek(referenceDate) };
    case 'THIS_MONTH':
      return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
    case 'LAST_30_DAYS': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29);
      return { start, end: todayEnd };
    }
    case 'LAST_90_DAYS': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 89);
      return { start, end: todayEnd };
    }
    default:
      return { start: null, end: null };
  }
}

function taskOverlapsRange(
  task: Task,
  bounds: { start: Date | null; end: Date | null },
): boolean {
  if (!bounds.start || !bounds.end) {
    return true;
  }

  const taskStart = parseDate(task.startDate);
  const taskEnd = parseDate(task.finishDate) ?? taskStart;
  if (!taskStart && !taskEnd) {
    return true;
  }

  const start = taskStart ?? taskEnd!;
  const end = taskEnd ?? taskStart!;
  return start.getTime() <= bounds.end.getTime() && end.getTime() >= bounds.start.getTime();
}

function buildProjectLookup(
  projects: Array<{ id: string; name: string; projectCode: string }>,
): Map<string, { name: string; projectCode: string }> {
  return new Map(
    projects.map((project) => [
      project.id,
      { name: project.name, projectCode: project.projectCode },
    ]),
  );
}

function matchesSearch(
  task: Task,
  search: string,
  projectLookup: Map<string, { name: string; projectCode: string }>,
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const project = projectLookup.get(task.projectId);
  const haystack = [
    task.name,
    task.taskIdCode,
    project?.name,
    project?.projectCode,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function buildDisciplineTaskIds(
  disciplines: ProjectDisciplineRow[],
  disciplineName?: string,
): Set<string> | null {
  if (!disciplineName) {
    return null;
  }

  const taskIds = new Set<string>();
  for (const row of disciplines) {
    if (row.disciplineName === disciplineName) {
      taskIds.add(row.taskId);
    }
  }
  return taskIds;
}

/** Applies dashboard filters to portfolio tasks and discipline rows. */
export function applyDashboardFilters(
  data: {
    projects: Array<{ id: string; name: string; projectCode: string }>;
    tasks: Task[];
    disciplines: ProjectDisciplineRow[];
  },
  filters: DashboardFilters,
): { tasks: Task[]; disciplines: ProjectDisciplineRow[] } {
  const projectLookup = buildProjectLookup(data.projects);
  const dateBounds = getDashboardDateRangeBounds(filters.dateRange);
  const disciplineTaskIds = buildDisciplineTaskIds(
    data.disciplines,
    filters.discipline,
  );

  const tasks = data.tasks.filter((task) => {
    if (filters.projectId && task.projectId !== filters.projectId) {
      return false;
    }
    if (filters.status && task.status !== filters.status) {
      return false;
    }
    if (filters.priority && task.urgencyLevel !== filters.priority) {
      return false;
    }
    if (!taskOverlapsRange(task, dateBounds)) {
      return false;
    }
    if (disciplineTaskIds && !disciplineTaskIds.has(task.id)) {
      return false;
    }
    if (!matchesSearch(task, filters.search, projectLookup)) {
      return false;
    }
    return true;
  });

  const taskIds = new Set(tasks.map((task) => task.id));
  const disciplines = data.disciplines.filter((row) => {
    if (!taskIds.has(row.taskId)) {
      return false;
    }
    if (filters.discipline && row.disciplineName !== filters.discipline) {
      return false;
    }
    return true;
  });

  return { tasks, disciplines };
}
