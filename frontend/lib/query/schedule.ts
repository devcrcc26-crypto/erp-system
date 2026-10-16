'use client';

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type { DesignPackage } from '@/lib/api/epc.types';
import { designPackageKeys } from '@/lib/query/design-packages';
import { designPackagesPath } from '@/lib/query/epc-query-utils';
import {
  useProjectDisciplines,
  type ProjectDisciplineRow,
} from '@/lib/query/disciplines';
import type {
  CreateMilestoneRequest,
  CreateTaskDependencyRequest,
  CreateTaskDisciplineRequest,
  CreateTaskRequest,
  Milestone,
  Task,
  TaskDependency,
  TaskDiscipline,
  UpdateMilestoneRequest,
  UpdateTaskDependencyRequest,
  UpdateTaskDisciplineRequest,
  UpdateTaskRequest,
} from '@/lib/api/project-management.types';
import { ApiRequestError } from '@/lib/api/errors';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';
import { useMemo } from 'react';

const SCHEDULE_STALE_MS = 60_000;

/** Maximum page size allowed by the API pagination DTO. */
export const SCHEDULE_PAGE_SIZE = 100;

function scheduleReadRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && (error.status === 429 || error.status === 403)) {
    return false;
  }
  return failureCount < 1;
}

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const scheduleBase = (projectId: string): string =>
  `${projectPath(projectId)}/schedule`;

export const scheduleKeys = {
  all: ['pm', 'schedule'] as const,
  milestones: (projectId: string) =>
    [...scheduleKeys.all, projectId, 'milestones'] as const,
  milestoneList: (
    projectId: string,
    params: PaginationParams = { page: 1, limit: 50 },
  ) => [...scheduleKeys.milestones(projectId), params] as const,
  tasks: (projectId: string) =>
    [...scheduleKeys.all, projectId, 'tasks'] as const,
  taskList: (
    projectId: string,
    params: PaginationParams = { page: 1, limit: 100 },
  ) => [...scheduleKeys.tasks(projectId), params] as const,
  taskDetail: (projectId: string, taskId: string) =>
    [...scheduleKeys.all, projectId, 'tasks', taskId, 'detail'] as const,
  dependencies: (projectId: string) =>
    [...scheduleKeys.all, projectId, 'dependencies'] as const,
  disciplines: (projectId: string, taskId: string) =>
    [...scheduleKeys.all, projectId, 'tasks', taskId, 'disciplines'] as const,
  subtasks: (projectId: string) =>
    [...scheduleKeys.all, projectId, 'subtasks'] as const,
};

/** Design package shown as a schedule subtask under a parent task. */
export interface ScheduleSubtaskEntry {
  package: DesignPackage;
  taskId: string;
  taskDisciplineId: string;
  disciplineName: string;
  documentCount: number;
}

/**
 * Loads design packages for all project disciplines and groups them by parent task.
 * Secondary fetch - does not block the task list from rendering.
 */
export function useScheduleSubtasks(projectId: string, enabled = true): {
  byTaskId: Map<string, ScheduleSubtaskEntry[]>;
  disciplines: ProjectDisciplineRow[];
  isLoading: boolean;
  isSubtasksLoading: boolean;
  isFetching: boolean;
} {
  const disciplinesQuery = useProjectDisciplines(projectId, enabled);
  const disciplines = useMemo(
    () => disciplinesQuery.data ?? [],
    [disciplinesQuery.data],
  );

  const { byTaskId, isPackagesLoading, isPackagesFetching } = useQueries({
    queries: disciplines.map((discipline) => ({
      queryKey: designPackageKeys.lists(projectId, discipline.id),
      queryFn: () =>
        apiGet<DesignPackage[]>(designPackagesPath(projectId, discipline.id)),
      enabled:
        enabled && Boolean(projectId) && disciplinesQuery.isSuccess,
      staleTime: SCHEDULE_STALE_MS,
      retry: scheduleReadRetry,
    })),
    combine: (results) => {
      const map = new Map<string, ScheduleSubtaskEntry[]>();

      disciplines.forEach((discipline, index) => {
        const packages = results[index]?.data ?? [];
        for (const pkg of packages) {
          const entry: ScheduleSubtaskEntry = {
            package: pkg,
            taskId: discipline.taskId,
            taskDisciplineId: discipline.id,
            disciplineName: discipline.disciplineName,
            documentCount: pkg.items?.length ?? 0,
          };
          const existing = map.get(discipline.taskId) ?? [];
          existing.push(entry);
          map.set(discipline.taskId, existing);
        }
      });

      for (const [taskId, entries] of map) {
        map.set(
          taskId,
          [...entries].sort((a, b) =>
            a.package.name.localeCompare(b.package.name),
          ),
        );
      }

      return {
        byTaskId: map,
        isPackagesLoading: results.some((result) => result.isLoading),
        isPackagesFetching: results.some((result) => result.isFetching),
      };
    },
  });

  const isSubtasksLoading = disciplinesQuery.isSuccess && isPackagesLoading;

  return {
    byTaskId,
    disciplines,
    isLoading: disciplinesQuery.isLoading,
    isSubtasksLoading,
    isFetching: disciplinesQuery.isFetching || isPackagesFetching,
  };
}

export function useMilestones(
  projectId: string,
  params: PaginationParams = { page: 1, limit: 50 },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Milestone>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: scheduleKeys.milestoneList(projectId, params),
    queryFn: () =>
      apiGetPaginated<Milestone>(
        `${scheduleBase(projectId)}/milestones${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    staleTime: SCHEDULE_STALE_MS,
    refetchOnMount: false,
    retry: scheduleReadRetry,
    ...options,
  });
}

export function useTasks(
  projectId: string,
  params: PaginationParams = { page: 1, limit: SCHEDULE_PAGE_SIZE },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Task>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: scheduleKeys.taskList(projectId, params),
    queryFn: () =>
      apiGetPaginated<Task>(
        `${scheduleBase(projectId)}/tasks${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    staleTime: SCHEDULE_STALE_MS,
    refetchOnMount: false,
    retry: scheduleReadRetry,
    ...options,
  });
}

export function useTask(
  projectId: string,
  taskId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<Task>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: scheduleKeys.taskDetail(projectId, taskId),
    queryFn: () => apiGet<Task>(`${scheduleBase(projectId)}/tasks/${taskId}`),
    enabled: Boolean(projectId) && Boolean(taskId) && enabled,
    staleTime: SCHEDULE_STALE_MS,
    refetchOnMount: false,
    retry: scheduleReadRetry,
    ...options,
  });
}

/**
 * Loads all schedule tasks for Gantt/list views by walking paginated endpoints.
 */
export async function fetchAllScheduleTasks(
  projectId: string,
): Promise<PaginatedResult<Task>> {
  const firstPage = await apiGetPaginated<Task>(
    `${scheduleBase(projectId)}/tasks${toQueryString({
      page: 1,
      limit: SCHEDULE_PAGE_SIZE,
    })}`,
  );

  if (firstPage.meta.pages <= 1) {
    return firstPage;
  }

  const remainingPages = Array.from(
    { length: firstPage.meta.pages - 1 },
    (_, index) => index + 2,
  );

  const pageResults = await Promise.all(
    remainingPages.map((page) =>
      apiGetPaginated<Task>(
        `${scheduleBase(projectId)}/tasks${toQueryString({
          page,
          limit: SCHEDULE_PAGE_SIZE,
        })}`,
      ),
    ),
  );

  const data: Task[] = [...firstPage.data];
  for (const result of pageResults) {
    data.push(...result.data);
  }

  return {
    data,
    meta: {
      total: firstPage.meta.total,
      page: 1,
      limit: firstPage.meta.total,
      pages: 1,
    },
  };
}

export function useAllTasks(
  projectId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Task>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: [...scheduleKeys.tasks(projectId), 'all'] as const,
    queryFn: () => fetchAllScheduleTasks(projectId),
    enabled: Boolean(projectId) && enabled,
    staleTime: SCHEDULE_STALE_MS,
    refetchOnMount: false,
    retry: scheduleReadRetry,
    ...options,
  });
}

export function useTaskDependencies(projectId: string, enabled = true) {
  return useQuery({
    queryKey: scheduleKeys.dependencies(projectId),
    queryFn: () =>
      apiGet<TaskDependency[]>(`${scheduleBase(projectId)}/task-dependencies`),
    enabled: Boolean(projectId) && enabled,
    staleTime: SCHEDULE_STALE_MS,
    refetchOnMount: false,
    retry: scheduleReadRetry,
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateMilestoneRequest;
    }) =>
      apiPost<Milestone>(`${scheduleBase(projectId)}/milestones`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.milestones(variables.projectId),
      });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      milestoneId,
      body,
    }: {
      projectId: string;
      milestoneId: string;
      body: UpdateMilestoneRequest;
    }) =>
      apiPatch<Milestone>(
        `${scheduleBase(projectId)}/milestones/${milestoneId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.milestones(variables.projectId),
      });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      milestoneId,
    }: {
      projectId: string;
      milestoneId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${scheduleBase(projectId)}/milestones/${milestoneId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.milestones(variables.projectId),
      });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateTaskRequest;
    }) => apiPost<Task>(`${scheduleBase(projectId)}/tasks`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.tasks(variables.projectId),
      });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
      body,
    }: {
      projectId: string;
      taskId: string;
      body: UpdateTaskRequest;
    }) =>
      apiPatch<Task>(`${scheduleBase(projectId)}/tasks/${taskId}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.tasks(variables.projectId),
      });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
    }: {
      projectId: string;
      taskId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${scheduleBase(projectId)}/tasks/${taskId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.tasks(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.dependencies(variables.projectId),
      });
    },
  });
}

export function useCreateTaskDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateTaskDependencyRequest;
    }) =>
      apiPost<TaskDependency>(
        `${scheduleBase(projectId)}/task-dependencies`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.dependencies(variables.projectId),
      });
    },
  });
}

export function useUpdateTaskDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dependencyId,
      body,
    }: {
      projectId: string;
      dependencyId: string;
      body: UpdateTaskDependencyRequest;
    }) =>
      apiPatch<TaskDependency>(
        `${scheduleBase(projectId)}/task-dependencies/${dependencyId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.dependencies(variables.projectId),
      });
    },
  });
}

export function useDeleteTaskDependency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dependencyId,
    }: {
      projectId: string;
      dependencyId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${scheduleBase(projectId)}/task-dependencies/${dependencyId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.dependencies(variables.projectId),
      });
    },
  });
}

export function useTaskDisciplines(
  projectId: string,
  taskId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: scheduleKeys.disciplines(projectId, taskId),
    queryFn: () =>
      apiGet<TaskDiscipline[]>(
        `${scheduleBase(projectId)}/tasks/${taskId}/disciplines`,
      ),
    enabled: Boolean(projectId) && Boolean(taskId) && enabled,
    staleTime: SCHEDULE_STALE_MS,
    refetchOnMount: false,
    retry: scheduleReadRetry,
  });
}

export function useCreateTaskDiscipline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
      body,
    }: {
      projectId: string;
      taskId: string;
      body: CreateTaskDisciplineRequest;
    }) =>
      apiPost<TaskDiscipline>(
        `${scheduleBase(projectId)}/tasks/${taskId}/disciplines`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.disciplines(
          variables.projectId,
          variables.taskId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'disciplines', variables.projectId],
      });
    },
  });
}

export function useUpdateTaskDiscipline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
      disciplineId,
      body,
    }: {
      projectId: string;
      taskId: string;
      disciplineId: string;
      body: UpdateTaskDisciplineRequest;
    }) =>
      apiPatch<TaskDiscipline>(
        `${scheduleBase(projectId)}/tasks/${taskId}/disciplines/${disciplineId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.disciplines(
          variables.projectId,
          variables.taskId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'disciplines', variables.projectId],
      });
    },
  });
}

export function useDeleteTaskDiscipline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
      disciplineId,
    }: {
      projectId: string;
      taskId: string;
      disciplineId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${scheduleBase(projectId)}/tasks/${taskId}/disciplines/${disciplineId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.disciplines(
          variables.projectId,
          variables.taskId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'disciplines', variables.projectId],
      });
    },
  });
}
