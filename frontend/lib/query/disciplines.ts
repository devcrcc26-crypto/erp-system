'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import { ApiRequestError } from '@/lib/api/errors';
import { projectPath } from '@/lib/query/pm-query-utils';

function scheduleBase(projectId: string): string {
  return `${projectPath(projectId)}/schedule`;
}

function scheduleReadRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && (error.status === 429 || error.status === 403)) {
    return false;
  }
  return failureCount < 1;
}

export interface ProjectDisciplineRow extends TaskDiscipline {
  taskName: string;
}

export const disciplineKeys = {
  all: ['epc', 'disciplines'] as const,
  project: (projectId: string) =>
    [...disciplineKeys.all, projectId] as const,
  find: (projectId: string, disciplineId: string) =>
    [...disciplineKeys.project(projectId), disciplineId] as const,
};

/**
 * Lists all disciplines across schedule tasks in a project (single API call).
 */
export function useProjectDisciplines(
  projectId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<ProjectDisciplineRow[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: disciplineKeys.project(projectId),
    queryFn: () =>
      apiGet<ProjectDisciplineRow[]>(`${scheduleBase(projectId)}/disciplines`),
    enabled: Boolean(projectId) && enabled,
    staleTime: 30_000,
    retry: scheduleReadRetry,
    ...options,
  });
}

/**
 * Resolves a discipline by id within a project.
 */
export function useProjectDiscipline(
  projectId: string,
  disciplineId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<ProjectDisciplineRow>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: disciplineKeys.find(projectId, disciplineId),
    queryFn: () =>
      apiGet<ProjectDisciplineRow>(
        `${scheduleBase(projectId)}/disciplines/${disciplineId}`,
      ),
    enabled: Boolean(projectId) && Boolean(disciplineId) && enabled,
    staleTime: 30_000,
    retry: scheduleReadRetry,
    ...options,
  });
}
