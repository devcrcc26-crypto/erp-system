'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { Project, Task } from '@/lib/api/project-management.types';
import type {
  DashboardOperationalStats,
  HrDashboardStats,
  MyDashboardStats,
  PortfolioDashboardStats,
} from '@/lib/api/reporting.types';
import { applyDashboardFilters } from '@/lib/dashboard/apply-dashboard-filters';
import { buildDashboardChartData } from '@/lib/dashboard/build-chart-data';
import type {
  DashboardFilters,
  PortfolioDashboardData,
} from '@/lib/dashboard/types';
import type { ProjectDisciplineRow } from '@/lib/query/disciplines';
import { fetchAllScheduleTasks } from '@/lib/query/schedule';
import { projectPath } from '@/lib/query/pm-query-utils';
import { useAllProjects } from '@/lib/query/projects';

function scheduleDisciplinesPath(projectId: string): string {
  return `${projectPath(projectId)}/schedule/disciplines`;
}

async function fetchPortfolioDisciplines(
  projectIds: readonly string[],
): Promise<ProjectDisciplineRow[]> {
  const results = await Promise.all(
    projectIds.map(async (projectId) => {
      try {
        return await apiGet<ProjectDisciplineRow[]>(
          scheduleDisciplinesPath(projectId),
        );
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}

async function fetchPortfolioTasks(
  projectIds: readonly string[],
): Promise<Task[]> {
  const results = await Promise.all(
    projectIds.map(async (projectId) => {
      try {
        const page = await fetchAllScheduleTasks(projectId);
        return page.data;
      } catch {
        return [];
      }
    }),
  );

  return results.flat();
}

async function fetchPortfolioDashboard(
  projects: Project[],
  projectId?: string,
): Promise<PortfolioDashboardData> {
  const scopedProjects = projectId
    ? projects.filter((project) => project.id === projectId)
    : projects;
  const projectIds = scopedProjects.map((project) => project.id);

  if (projectIds.length === 0) {
    return { projects: scopedProjects, tasks: [], disciplines: [] };
  }

  const [tasks, disciplines] = await Promise.all([
    fetchPortfolioTasks(projectIds),
    fetchPortfolioDisciplines(projectIds),
  ]);

  return { projects: scopedProjects, tasks, disciplines };
}

export const dashboardKeys = {
  all: ['portfolio-dashboard'] as const,
  data: (projectId?: string) =>
    [...dashboardKeys.all, 'data', projectId ?? 'all'] as const,
  portfolioStats: ['dashboard', 'portfolio'] as const,
  myStats: ['dashboard', 'my'] as const,
  hrStats: ['dashboard', 'hr'] as const,
  operationalStats: ['dashboard', 'stats'] as const,
};

/** Company-wide PM aggregates from GET /dashboard/portfolio. */
export function usePortfolioDashboardStats(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.portfolioStats,
    queryFn: () => apiGet<PortfolioDashboardStats>('/dashboard/portfolio'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** FK-scoped personal dashboard from GET /dashboard/my. */
export function useMyDashboard(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.myStats,
    queryFn: () => apiGet<MyDashboardStats>('/dashboard/my'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** HR aggregates from GET /dashboard/hr. */
export function useHrDashboard(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.hrStats,
    queryFn: () => apiGet<HrDashboardStats>('/dashboard/hr'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Role-adapted operational stats from GET /dashboard/stats. */
export function useDashboardOperationalStats(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.operationalStats,
    queryFn: () => apiGet<DashboardOperationalStats>('/dashboard/stats'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Loads portfolio tasks and disciplines, then applies dashboard filters client-side. */
export function usePortfolioDashboard(
  filters: DashboardFilters,
  enabled = true,
): {
  projects: Project[];
  chartData: ReturnType<typeof buildDashboardChartData>;
  filteredTaskCount: number;
  disciplineOptions: string[];
  isLoading: boolean;
  isFetching: boolean;
} {
  const projectsQuery = useAllProjects({}, enabled);
  const projects = projectsQuery.data?.data ?? [];

  const portfolioQuery = useQuery({
    queryKey: dashboardKeys.data(filters.projectId),
    queryFn: () => fetchPortfolioDashboard(projects, filters.projectId),
    enabled: enabled && projectsQuery.isSuccess,
    staleTime: 30_000,
    retry: false,
  });

  const filtered = useMemo(() => {
    const payload = portfolioQuery.data;
    if (!payload) {
      return { tasks: [], disciplines: [] };
    }
    return applyDashboardFilters(payload, filters);
  }, [portfolioQuery.data, filters]);

  const chartData = useMemo(
    () => buildDashboardChartData(filtered.tasks, filtered.disciplines),
    [filtered.tasks, filtered.disciplines],
  );

  const disciplineOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of portfolioQuery.data?.disciplines ?? []) {
      names.add(row.disciplineName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [portfolioQuery.data?.disciplines]);

  const isLoading = projectsQuery.isLoading || portfolioQuery.isLoading;
  const isFetching = projectsQuery.isFetching || portfolioQuery.isFetching;

  return {
    projects,
    chartData,
    filteredTaskCount: filtered.tasks.length,
    disciplineOptions,
    isLoading,
    isFetching,
  };
}
