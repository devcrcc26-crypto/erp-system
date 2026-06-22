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
  CreateDailyLogEquipmentRequest,
  CreateDailyLogIncidentRequest,
  CreateDailyLogRequest,
  CreateDailyLogVisitorRequest,
  CreateDailyLogWorkforceRequest,
  DailyLog,
  DailyLogDetail,
  DailyLogEquipment,
  DailyLogIncident,
  DailyLogVisitor,
  DailyLogWorkforce,
  PmListFilters,
  UpdateDailyLogRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

export interface DailyLogListParams extends PaginationParams, PmListFilters {
  logDateFrom?: string;
  logDateTo?: string;
}

const dailyLogsPath = (projectId: string): string =>
  projectPath(projectId, 'daily-logs');

export const dailyLogKeys = {
  all: ['pm', 'daily-logs'] as const,
  lists: (projectId: string) =>
    [...dailyLogKeys.all, projectId, 'list'] as const,
  list: (projectId: string, params: DailyLogListParams = { page: 1, limit: 20 }) =>
    [...dailyLogKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...dailyLogKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, dailyLogId: string) =>
    [...dailyLogKeys.details(projectId), dailyLogId] as const,
};

export function useDailyLogs(
  projectId: string,
  params: DailyLogListParams = { page: 1, limit: 20 },
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
    }) => apiPost<DailyLogDetail>(dailyLogsPath(projectId), body),
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

export function useAddDailyLogWorkforce() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      body,
    }: {
      projectId: string;
      dailyLogId: string;
      body: CreateDailyLogWorkforceRequest;
    }) =>
      apiPost<DailyLogWorkforce>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/workforce`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useRemoveDailyLogWorkforce() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      workforceId,
    }: {
      projectId: string;
      dailyLogId: string;
      workforceId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/workforce/${workforceId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useAddDailyLogEquipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      body,
    }: {
      projectId: string;
      dailyLogId: string;
      body: CreateDailyLogEquipmentRequest;
    }) =>
      apiPost<DailyLogEquipment>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/equipment`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useRemoveDailyLogEquipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      equipmentId,
    }: {
      projectId: string;
      dailyLogId: string;
      equipmentId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/equipment/${equipmentId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useAddDailyLogVisitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      body,
    }: {
      projectId: string;
      dailyLogId: string;
      body: CreateDailyLogVisitorRequest;
    }) =>
      apiPost<DailyLogVisitor>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/visitors`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useRemoveDailyLogVisitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      visitorId,
    }: {
      projectId: string;
      dailyLogId: string;
      visitorId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/visitors/${visitorId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useAddDailyLogIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      body,
    }: {
      projectId: string;
      dailyLogId: string;
      body: CreateDailyLogIncidentRequest;
    }) =>
      apiPost<DailyLogIncident>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/incidents`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

export function useRemoveDailyLogIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      dailyLogId,
      incidentId,
    }: {
      projectId: string;
      dailyLogId: string;
      incidentId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${dailyLogsPath(projectId)}/${dailyLogId}/incidents/${incidentId}`,
      ),
    onSuccess: (_data, variables) => {
      void invalidateDailyLogDetail(queryClient, variables);
    },
  });
}

function invalidateDailyLogDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  variables: { projectId: string; dailyLogId: string },
): void {
  void queryClient.invalidateQueries({
    queryKey: dailyLogKeys.lists(variables.projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: dailyLogKeys.detail(variables.projectId, variables.dailyLogId),
  });
}
