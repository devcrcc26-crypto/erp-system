'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiGet, apiGetPaginated } from '@/lib/api/client';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import type { Task } from '@/lib/api/project-management.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  SCHEDULE_PAGE_SIZE,
} from '@/lib/query/schedule';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

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

async function fetchAllTasks(projectId: string): Promise<Task[]> {
  const firstPage = await apiGetPaginated<Task>(
    `${scheduleBase(projectId)}/tasks${toQueryString({
      page: 1,
      limit: SCHEDULE_PAGE_SIZE,
    })}`,
  );

  if (firstPage.meta.pages <= 1) {
    return firstPage.data;
  }

  const data: Task[] = [...firstPage.data];
  for (let page = 2; page <= firstPage.meta.pages; page += 1) {
    const result = await apiGetPaginated<Task>(
      `${scheduleBase(projectId)}/tasks${toQueryString({
        page,
        limit: SCHEDULE_PAGE_SIZE,
      })}`,
    );
    data.push(...result.data);
  }
  return data;
}

/**
 * Aggregates task disciplines across all schedule tasks in a project.
 */
export function useProjectDisciplines(
  projectId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<ProjectDisciplineRow[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: disciplineKeys.project(projectId),
    queryFn: async (): Promise<ProjectDisciplineRow[]> => {
      const tasks = await fetchAllTasks(projectId);
      const rows = await Promise.all(
        tasks.map(async (task) => {
          const disciplines = await apiGet<TaskDiscipline[]>(
            `${scheduleBase(projectId)}/tasks/${task.id}/disciplines`,
          );
          return disciplines.map(
            (discipline): ProjectDisciplineRow => ({
              ...discipline,
              taskId: task.id,
              taskName: task.name,
            }),
          );
        }),
      );
      return rows.flat();
    },
    enabled: Boolean(projectId) && enabled,
    retry: scheduleReadRetry,
    ...options,
  });
}

/**
 * Resolves a discipline by id by scanning all project disciplines.
 */
export function useProjectDiscipline(
  projectId: string,
  disciplineId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: disciplineKeys.find(projectId, disciplineId),
    queryFn: async (): Promise<ProjectDisciplineRow | null> => {
      const tasks = await fetchAllTasks(projectId);
      for (const task of tasks) {
        const disciplines = await apiGet<TaskDiscipline[]>(
          `${scheduleBase(projectId)}/tasks/${task.id}/disciplines`,
        );
        const match = disciplines.find((d) => d.id === disciplineId);
        if (match) {
          return { ...match, taskId: task.id, taskName: task.name };
        }
      }
      return null;
    },
    enabled: Boolean(projectId) && Boolean(disciplineId) && enabled,
    retry: scheduleReadRetry,
  });
}
