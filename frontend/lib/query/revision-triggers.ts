// Gap completion - new

'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPost } from '@/lib/api/client';
import type {
  ExternalReviewTrigger,
  ExternalReviewTriggerStatus,
} from '@/lib/api/project-management.types';
import type { WorkflowResultSnapshot } from '@/lib/api/epc.types';
import type { PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

export const revisionTriggerKeys = {
  all: ['epc', 'revision-triggers'] as const,
  lists: (projectId: string) =>
    [...revisionTriggerKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams & { status?: ExternalReviewTriggerStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...revisionTriggerKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...revisionTriggerKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, triggerId: string) =>
    [...revisionTriggerKeys.details(projectId), triggerId] as const,
};

export function useRevisionTriggers(
  projectId: string,
  status: ExternalReviewTriggerStatus = 'PENDING',
  params: PaginationParams = { page: 1, limit: 20 },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<ExternalReviewTrigger>>,
    'queryKey' | 'queryFn'
  >,
) {
  const queryParams = { ...params, status };

  return useQuery({
    queryKey: revisionTriggerKeys.list(projectId, queryParams),
    queryFn: () =>
      apiGetPaginated<ExternalReviewTrigger>(
        `${projectPath(projectId)}/revision-triggers${toQueryString(queryParams)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useRevisionTrigger(
  projectId: string,
  triggerId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: revisionTriggerKeys.detail(projectId, triggerId),
    queryFn: () =>
      apiGet<ExternalReviewTrigger>(
        `${projectPath(projectId)}/revision-triggers/${triggerId}`,
      ),
    enabled: Boolean(projectId) && Boolean(triggerId) && enabled,
    retry: false,
  });
}

export function useProcessRevisionTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      triggerId,
    }: {
      projectId: string;
      triggerId: string;
    }) =>
      apiPost<WorkflowResultSnapshot[]>(
        `${projectPath(projectId)}/revision-triggers/${triggerId}/process`,
        {},
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: revisionTriggerKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'engineering-documents', variables.projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['epc', 'workspace', 'review-sessions', variables.projectId],
      });
    },
  });
}
