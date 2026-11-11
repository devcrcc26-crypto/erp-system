'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { Project } from '@/lib/api/project-management.types';
import type { DepartmentRow } from '@/lib/query/org';
import { useAllProjects } from '@/lib/query/projects';
import { designPackageKeys } from '@/lib/query/design-packages';
import { designPackagesPath } from '@/lib/query/epc-query-utils';
import { disciplineKeys } from '@/lib/query/disciplines';
import { scheduleKeys, SCHEDULE_PAGE_SIZE } from '@/lib/query/schedule';
import { apiGet, apiGetPaginated } from '@/lib/api/client';
import type { DesignPackage } from '@/lib/api/epc.types';
import type { Task } from '@/lib/api/project-management.types';
import type { ProjectDisciplineRow } from '@/lib/query/disciplines';
import {
  filterProjectsForDepartments,
  projectBelongsToDepartment,
} from '@/lib/utils/department-project-link';
import { getScheduleSubtaskDisplayStatus } from '@/lib/utils/schedule-subtasks';

export interface DepartmentMetrics {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  totalSubtasks: number;
  openSubtasks: number;
  disciplinesInUse: number;
  isLoading: boolean;
}

function emptyMetrics(loading: boolean): DepartmentMetrics {
  return {
    totalProjects: 0,
    activeProjects: 0,
    totalTasks: 0,
    totalSubtasks: 0,
    openSubtasks: 0,
    disciplinesInUse: 0,
    isLoading: loading,
  };
}

/**
 * Derives portfolio metrics for one or more departments from scoped project data.
 */
export function useDepartmentMetrics(
  departments: Array<Pick<DepartmentRow, 'id' | 'code'>>,
  enabled = true,
): DepartmentMetrics {
  const projectsQuery = useAllProjects({}, enabled);
  const projects = useMemo(() => {
    const rows = projectsQuery.data?.data ?? [];
    if (departments.length === 0) {
      return rows;
    }
    return filterProjectsForDepartments(rows, departments);
  }, [departments, projectsQuery.data?.data]);

  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );

  const taskQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: scheduleKeys.taskList(projectId, {
        page: 1,
        limit: SCHEDULE_PAGE_SIZE,
      }),
      queryFn: () =>
        apiGetPaginated<Task>(
          `/projects/${projectId}/schedule/tasks?page=1&limit=${SCHEDULE_PAGE_SIZE}`,
        ),
      enabled: enabled && projectsQuery.isSuccess,
      staleTime: 60_000,
    })),
  });

  const disciplineQueries = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: disciplineKeys.project(projectId),
      queryFn: () =>
        apiGet<ProjectDisciplineRow[]>(
          `/projects/${projectId}/schedule/disciplines`,
        ),
      enabled: enabled && projectsQuery.isSuccess,
      staleTime: 60_000,
    })),
  });

  const disciplinePairs = useMemo(() => {
    const pairs: Array<{ projectId: string; disciplineId: string }> = [];
    projectIds.forEach((projectId, index) => {
      const rows = disciplineQueries[index]?.data ?? [];
      for (const row of rows) {
        pairs.push({ projectId, disciplineId: row.id });
      }
    });
    return pairs;
  }, [disciplineQueries, projectIds]);

  const packageQueries = useQueries({
    queries: disciplinePairs.map(({ projectId, disciplineId }) => ({
      queryKey: designPackageKeys.lists(projectId, disciplineId),
      queryFn: () =>
        apiGet<DesignPackage[]>(designPackagesPath(projectId, disciplineId)),
      enabled: enabled && projectsQuery.isSuccess,
      staleTime: 60_000,
    })),
  });

  const isLoading =
    projectsQuery.isLoading ||
    taskQueries.some((query) => query.isLoading) ||
    disciplineQueries.some((query) => query.isLoading) ||
    packageQueries.some((query) => query.isLoading);

  return useMemo(() => {
    if (!enabled) {
      return emptyMetrics(false);
    }

    const totalProjects = projects.length;
    const activeProjects = projects.filter(
      (project) => project.status === 'IN_PROGRESS',
    ).length;

    const totalTasks = taskQueries.reduce(
      (sum, query) => sum + (query.data?.data.length ?? 0),
      0,
    );

    const packages = packageQueries.flatMap((query) => query.data ?? []);
    const totalSubtasks = packages.length;
    const openSubtasks = packages.filter(
      (pkg) => getScheduleSubtaskDisplayStatus(pkg) === 'OPEN',
    ).length;

    const disciplineIds = new Set<string>();
    disciplineQueries.forEach((query) => {
      for (const row of query.data ?? []) {
        if (row.disciplineId) {
          disciplineIds.add(row.disciplineId);
        }
      }
    });

    return {
      totalProjects,
      activeProjects,
      totalTasks,
      totalSubtasks,
      openSubtasks,
      disciplinesInUse: disciplineIds.size,
      isLoading,
    };
  }, [
    disciplineQueries,
    enabled,
    isLoading,
    packageQueries,
    projects,
    taskQueries,
  ]);
}

/**
 * Counts active (IN_PROGRESS) projects for a single department row.
 */
export function countActiveProjectsForDepartment(
  projects: Array<Project & { departmentId?: string | null }>,
  department: Pick<DepartmentRow, 'id' | 'code'>,
): number {
  return projects.filter(
    (project) =>
      project.status === 'IN_PROGRESS' &&
      projectBelongsToDepartment(project, department),
  ).length;
}

/**
 * Counts all projects linked to a department row.
 */
export function countProjectsForDepartment(
  projects: Array<Project & { departmentId?: string | null }>,
  department: Pick<DepartmentRow, 'id' | 'code'>,
): number {
  return projects.filter((project) =>
    projectBelongsToDepartment(project, department),
  ).length;
}
