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
  CreateRfiRequest,
  CreateRfiResponseRequest,
  PmListFilters,
  Rfi,
  RfiResponse,
  RfiStatus,
  UpdateRfiRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const rfisPath = (projectId: string): string => projectPath(projectId, 'rfis');

export const rfiKeys = {
  all: ['pm', 'rfis'] as const,
  lists: (projectId: string) => [...rfiKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & PmListFilters & { status?: RfiStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...rfiKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...rfiKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, rfiId: string) =>
    [...rfiKeys.details(projectId), rfiId] as const,
  responses: (projectId: string, rfiId: string) =>
    [...rfiKeys.detail(projectId, rfiId), 'responses'] as const,
};

export function useRfis(
  projectId: string,
  params: PaginationParams & PmListFilters & { status?: RfiStatus } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<UseQueryOptions<PaginatedResult<Rfi>>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: rfiKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Rfi>(`${rfisPath(projectId)}${toQueryString(params)}`),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useRfi(projectId: string, rfiId: string, enabled = true) {
  return useQuery({
    queryKey: rfiKeys.detail(projectId, rfiId),
    queryFn: () => apiGet<Rfi>(`${rfisPath(projectId)}/${rfiId}`),
    enabled: Boolean(projectId) && Boolean(rfiId) && enabled,
    retry: false,
  });
}

export function useRfiResponses(projectId: string, rfiId: string, enabled = true) {
  return useQuery({
    queryKey: rfiKeys.responses(projectId, rfiId),
    queryFn: () =>
      apiGet<RfiResponse[]>(`${rfisPath(projectId)}/${rfiId}/responses`),
    enabled: Boolean(projectId) && Boolean(rfiId) && enabled,
    retry: false,
  });
}

export function useCreateRfi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateRfiRequest;
    }) => apiPost<Rfi>(rfisPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateRfi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      rfiId,
      body,
    }: {
      projectId: string;
      rfiId: string;
      body: UpdateRfiRequest;
    }) => apiPatch<Rfi>(`${rfisPath(projectId)}/${rfiId}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.detail(variables.projectId, variables.rfiId),
      });
    },
  });
}

export function useDeleteRfi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      rfiId,
    }: {
      projectId: string;
      rfiId: string;
    }) => apiDelete<MessageResponse>(`${rfisPath(projectId)}/${rfiId}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.lists(variables.projectId),
      });
    },
  });
}

export function useAddRfiResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      rfiId,
      body,
    }: {
      projectId: string;
      rfiId: string;
      body: CreateRfiResponseRequest;
    }) =>
      apiPost<RfiResponse>(
        `${rfisPath(projectId)}/${rfiId}/responses`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.detail(variables.projectId, variables.rfiId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.responses(variables.projectId, variables.rfiId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.lists(variables.projectId),
      });
    },
  });
}
