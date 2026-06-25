// Gap completion — new

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
  ChangeRequestStatus,
  CreateChangeRequestDto,
  PmListFilters,
  ProjectChangeRequest,
  RejectChangeRequestDto,
  UpdateChangeRequestDto,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const changeRequestsPath = (projectId: string): string =>
  projectPath(projectId, 'change-requests');

export const changeRequestKeys = {
  all: ['pm', 'change-requests'] as const,
  lists: (projectId: string) =>
    [...changeRequestKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams &
      PmListFilters & { status?: ChangeRequestStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...changeRequestKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...changeRequestKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, changeRequestId: string) =>
    [...changeRequestKeys.details(projectId), changeRequestId] as const,
};

export function useChangeRequests(
  projectId: string,
  params: PaginationParams &
    PmListFilters & { status?: ChangeRequestStatus } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<ProjectChangeRequest>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: changeRequestKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useChangeRequest(
  projectId: string,
  changeRequestId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: changeRequestKeys.detail(projectId, changeRequestId),
    queryFn: () =>
      apiGet<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}/${changeRequestId}`,
      ),
    enabled: Boolean(projectId) && Boolean(changeRequestId) && enabled,
    retry: false,
  });
}

export function useChangeRequestOpenCount(projectId: string, enabled = true) {
  return useQuery({
    queryKey: [...changeRequestKeys.lists(projectId), 'open-count'] as const,
    queryFn: async (): Promise<number> => {
      const result = await apiGetPaginated<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}${toQueryString({
          page: 1,
          limit: 100,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })}`,
      );
      return result.data.filter((row) => row.status === 'SUBMITTED').length;
    },
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

export function useCreateChangeRequest(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateChangeRequestDto) =>
      apiPost<ProjectChangeRequest>(changeRequestsPath(projectId), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.lists(projectId),
      });
    },
  });
}

export function useUpdateChangeRequest(
  projectId: string,
  changeRequestId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateChangeRequestDto) =>
      apiPatch<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}/${changeRequestId}`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.lists(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.detail(projectId, changeRequestId),
      });
    },
  });
}

export function useApproveChangeRequest(
  projectId: string,
  changeRequestId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPatch<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}/${changeRequestId}/approve`,
        {},
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.lists(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.detail(projectId, changeRequestId),
      });
    },
  });
}

export function useRejectChangeRequest(
  projectId: string,
  changeRequestId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: RejectChangeRequestDto) =>
      apiPatch<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}/${changeRequestId}/reject`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.lists(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.detail(projectId, changeRequestId),
      });
    },
  });
}

export function useDeleteChangeRequest(
  projectId: string,
  changeRequestId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiDelete<MessageResponse>(
        `${changeRequestsPath(projectId)}/${changeRequestId}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.lists(projectId),
      });
    },
  });
}
