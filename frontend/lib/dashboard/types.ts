import type {
  Project,
  Task,
  TaskStatus,
  UrgencyLevel,
} from '@/lib/api/project-management.types';
import type { ProjectDisciplineRow } from '@/lib/query/disciplines';

export type DashboardDateRange =
  | 'ALL_TIME'
  | 'THIS_WEEK'
  | 'THIS_MONTH'
  | 'LAST_30_DAYS'
  | 'LAST_90_DAYS';

export interface DashboardFilters {
  search: string;
  status?: TaskStatus;
  dateRange: DashboardDateRange;
  priority?: UrgencyLevel;
  projectId?: string;
  discipline?: string;
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  search: '',
  dateRange: 'ALL_TIME',
};

export interface DashboardChartDatum {
  name: string;
  value: number;
  color?: string;
}

export interface DashboardChartData {
  taskTimeline: DashboardChartDatum[];
  disciplineWorkload: DashboardChartDatum[];
  priorityBreakdown: DashboardChartDatum[];
  completionRate: number;
}

export interface PortfolioDashboardData {
  projects: Project[];
  tasks: Task[];
  disciplines: ProjectDisciplineRow[];
}
