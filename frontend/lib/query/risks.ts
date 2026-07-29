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
  CreateRiskMitigationRequest,
  CreateRiskRequest,
  PmListFilters,
  Risk,
  RiskCategory,
  RiskDetail,
  RiskProjectOption,
  RiskStatus,
  UpdateRiskMitigationRequest,
  UpdateRiskRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const risksPath = (projectId: string): string => projectPath(projectId, 'risks');

export const riskKeys = {
  all: ['pm', 'risks'] as const,
  lists: (projectId: string) => [...riskKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams &
      PmListFilters & {
      status?: RiskStatus;
      category?: RiskCategory;
      probability?: number;
      impact?: number;
    } = {
      page: 1,
      limit: 20,
    },
  ) => [...riskKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...riskKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, riskId: string) =>
    [...riskKeys.details(projectId), riskId] as const,
  myList: (
    params: PaginationParams &
      PmListFilters & { status?: string; category?: RiskCategory } = {
      page: 1,
      limit: 20,
    },
  ) => [...riskKeys.all, 'my', params] as const,
  allList: (
    params: PaginationParams &
      PmListFilters & { status?: string; category?: RiskCategory } = {
      page: 1,
      limit: 20,
    },
  ) => [...riskKeys.all, 'all', params] as const,
  myProjects: () => [...riskKeys.all, 'my', 'projects'] as const,
};

export function useRisks(
  projectId: string,
  params: PaginationParams &
    PmListFilters & {
      status?: RiskStatus;
      category?: RiskCategory;
      probability?: number;
      impact?: number;
    } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Risk>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: riskKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Risk>(`${risksPath(projectId)}${toQueryString(params)}`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useRisk(projectId: string, riskId: string, enabled = true) {
  return useQuery({
    queryKey: riskKeys.detail(projectId, riskId),
    queryFn: () => apiGet<RiskDetail>(`${risksPath(projectId)}/${riskId}`),
    enabled: Boolean(projectId) && Boolean(riskId) && enabled,
    retry: false,
  });
}

export function useCreateRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateRiskRequest;
    }) => apiPost<Risk>(risksPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: riskKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
      body,
    }: {
      projectId: string;
      riskId: string;
      body: UpdateRiskRequest;
    }) => apiPatch<Risk>(`${risksPath(projectId)}/${riskId}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: riskKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: riskKeys.detail(variables.projectId, variables.riskId),
      });
    },
  });
}

export function useAddRiskMitigation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
      body,
    }: {
      projectId: string;
      riskId: string;
      body: CreateRiskMitigationRequest;
    }) =>
      apiPost<RiskDetail>(
        `${risksPath(projectId)}/${riskId}/mitigations`,
        body,
      ),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        riskKeys.detail(variables.projectId, variables.riskId),
        data,
      );
      void queryClient.invalidateQueries({
        queryKey: riskKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({ queryKey: riskKeys.all });
    },
  });
}

export function useUpdateRiskMitigation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
      mitigationId,
      body,
    }: {
      projectId: string;
      riskId: string;
      mitigationId: string;
      body: UpdateRiskMitigationRequest;
    }) =>
      apiPatch<RiskDetail>(
        `${risksPath(projectId)}/${riskId}/mitigations/${mitigationId}`,
        body,
      ),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        riskKeys.detail(variables.projectId, variables.riskId),
        data,
      );
      void queryClient.invalidateQueries({
        queryKey: riskKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({ queryKey: riskKeys.all });
    },
  });
}

function invalidateRiskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  riskId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: riskKeys.lists(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: riskKeys.detail(projectId, riskId),
  });
  void queryClient.invalidateQueries({ queryKey: riskKeys.all });
}

export function useAcceptRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
      notes,
    }: {
      projectId: string;
      riskId: string;
      notes?: string;
    }) =>
      apiPost<Risk>(`${risksPath(projectId)}/${riskId}/accept`, {
        notes,
      }),
    onSuccess: (_data, variables) => {
      invalidateRiskQueries(
        queryClient,
        variables.projectId,
        variables.riskId,
      );
    },
  });
}

export function useCloseRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
      notes,
    }: {
      projectId: string;
      riskId: string;
      notes?: string;
    }) =>
      apiPost<Risk>(`${risksPath(projectId)}/${riskId}/close`, {
        notes,
      }),
    onSuccess: (_data, variables) => {
      invalidateRiskQueries(
        queryClient,
        variables.projectId,
        variables.riskId,
      );
    },
  });
}

export function useReopenRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
      notes,
    }: {
      projectId: string;
      riskId: string;
      notes: string;
    }) =>
      apiPost<Risk>(`${risksPath(projectId)}/${riskId}/reopen`, {
        notes,
      }),
    onSuccess: (_data, variables) => {
      invalidateRiskQueries(
        queryClient,
        variables.projectId,
        variables.riskId,
      );
    },
  });
}

export function useMyRisks(
  params: PaginationParams &
    PmListFilters & { status?: string; category?: RiskCategory } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Risk>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: riskKeys.myList(params),
    queryFn: () => apiGetPaginated<Risk>(`/risks/my${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

export function useAllRisks(
  params: PaginationParams &
    PmListFilters & { status?: string; category?: RiskCategory } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Risk>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: riskKeys.allList(params),
    queryFn: () => apiGetPaginated<Risk>(`/risks/all${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

export function useMyRiskProjects(enabled = true) {
  return useQuery({
    queryKey: riskKeys.myProjects(),
    queryFn: () => apiGet<RiskProjectOption[]>('/risks/my/projects'),
    enabled,
    retry: false,
  });
}

export function useDeleteRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      riskId,
    }: {
      projectId: string;
      riskId: string;
    }) => apiDelete<MessageResponse>(`${risksPath(projectId)}/${riskId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: riskKeys.lists(variables.projectId),
      });
    },
  });
}
