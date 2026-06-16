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
  CreateDailyLogRequest,
  DailyLog,
  DailyLogDetail,
  PmListFilters,
  UpdateDailyLogRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const dailyLogsPath = (projectId: string): string =>
  projectPath(projectId, 'daily-logs');

export const dailyLogKeys = {
  all: ['pm', 'daily-logs'] as const,
  lists: (projectId: string) =>
    [...dailyLogKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & PmListFilters & { logDateFrom?: string; logDateTo?: string } = {
      page: 1,
      limit: 20,
    },
  ) => [...dailyLogKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...dailyLogKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, dailyLogId: string) =>
    [...dailyLogKeys.details(projectId), dailyLogId] as const,
};

export function useDailyLogs(
  projectId: string,
  params: PaginationParams &
    PmListFilters & { logDateFrom?: string; logDateTo?: string } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<DailyLog>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: dailyLogKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<DailyLog>(
        `${dailyLogsPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useDailyLog(
  projectId: string,
  dailyLogId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: dailyLogKeys.detail(projectId, dailyLogId),
    queryFn: () =>
      apiGet<DailyLogDetail>(`${dailyLogsPath(projectId)}/${dailyLogId}`),
    enabled: Boolean(projectId) && Boolean(dailyLogId) && enabled,
    retry: false,
  });
}

export function useCreateDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateDailyLogRequest;
    }) => apiPost<DailyLog>(dailyLogsPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: dailyLogKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      body,
    }: {
      projectId: string;
      dailyLogId: string;
      body: UpdateDailyLogRequest;
    }) =>
      apiPatch<DailyLogDetail>(
        `${dailyLogsPath(projectId)}/${dailyLogId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: dailyLogKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: dailyLogKeys.detail(
          variables.projectId,
          variables.dailyLogId,
        ),
      });
    },
  });
}

export function useDeleteDailyLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
    }: {
      projectId: string;
      dailyLogId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${dailyLogsPath(projectId)}/${dailyLogId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: dailyLogKeys.lists(variables.projectId),
      });
    },
  });
}
