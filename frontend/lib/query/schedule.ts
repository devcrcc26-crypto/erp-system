'use client';

import {
  useMutation,
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
import type {
  CreateMilestoneRequest,
  CreateTaskDependencyRequest,
  CreateTaskRequest,
  Milestone,
  Task,
  TaskDependency,
  UpdateMilestoneRequest,
  UpdateTaskRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

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
  dependencies: (projectId: string) =>
    [...scheduleKeys.all, projectId, 'dependencies'] as const,
};

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
    retry: false,
    ...options,
  });
}

export function useTasks(
  projectId: string,
  params: PaginationParams = { page: 1, limit: 100 },
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
    retry: false,
    ...options,
  });
}

export function useTaskDependencies(projectId: string, enabled = true) {
  return useQuery({
    queryKey: scheduleKeys.dependencies(projectId),
    queryFn: () =>
      apiGet<TaskDependency[]>(`${scheduleBase(projectId)}/task-dependencies`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
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
