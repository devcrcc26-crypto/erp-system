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
  Correspondence,
  CorrespondenceStatus,
  CreateCorrespondenceRequest,
  PmListFilters,
  UpdateCorrespondenceRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const correspondencePath = (projectId: string): string =>
  projectPath(projectId, 'correspondence');

export const correspondenceKeys = {
  all: ['pm', 'correspondence'] as const,
  lists: (projectId: string) =>
    [...correspondenceKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams &
      PmListFilters & { status?: CorrespondenceStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...correspondenceKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...correspondenceKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, correspondenceId: string) =>
    [...correspondenceKeys.details(projectId), correspondenceId] as const,
};

export function useCorrespondence(
  projectId: string,
  params: PaginationParams &
    PmListFilters & { status?: CorrespondenceStatus } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Correspondence>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: correspondenceKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Correspondence>(
        `${correspondencePath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useCorrespondenceItem(
  projectId: string,
  correspondenceId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: correspondenceKeys.detail(projectId, correspondenceId),
    queryFn: () =>
      apiGet<Correspondence>(
        `${correspondencePath(projectId)}/${correspondenceId}`,
      ),
    enabled: Boolean(projectId) && Boolean(correspondenceId) && enabled,
    retry: false,
  });
}

export function useCreateCorrespondence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreateCorrespondenceRequest;
    }) => apiPost<Correspondence>(correspondencePath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: correspondenceKeys.lists(variables.projectId),
      });
    },
  });
}

export function useUpdateCorrespondence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      correspondenceId,
      body,
    }: {
      projectId: string;
      correspondenceId: string;
      body: UpdateCorrespondenceRequest;
    }) =>
      apiPatch<Correspondence>(
        `${correspondencePath(projectId)}/${correspondenceId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: correspondenceKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: correspondenceKeys.detail(
          variables.projectId,
          variables.correspondenceId,
        ),
      });
    },
  });
}

export function useDeleteCorrespondence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      correspondenceId,
    }: {
      projectId: string;
      correspondenceId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${correspondencePath(projectId)}/${correspondenceId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: correspondenceKeys.lists(variables.projectId),
      });
    },
  });
}
