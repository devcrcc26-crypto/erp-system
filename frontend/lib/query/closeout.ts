'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  Closeout,
  CloseoutChecklistItem,
  CloseoutDetail,
  UpdateCloseoutChecklistItemRequest,
  UpdateCloseoutRequest,
} from '@/lib/api/project-management.types';
import { projectPath } from '@/lib/query/pm-query-utils';

const closeoutPath = (projectId: string): string =>
  projectPath(projectId, 'closeout');

export const closeoutKeys = {
  all: ['pm', 'closeout'] as const,
  detail: (projectId: string) => [...closeoutKeys.all, projectId] as const,
  checklist: (projectId: string) =>
    [...closeoutKeys.detail(projectId), 'checklist'] as const,
};

export function useCloseout(
  projectId: string,
  enabled = true,
  options?: Omit<UseQueryOptions<CloseoutDetail>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: closeoutKeys.detail(projectId),
    queryFn: () => apiGet<CloseoutDetail>(closeoutPath(projectId)),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useInitializeCloseout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) =>
      apiPost<Closeout>(closeoutPath(projectId), {}),
    onSuccess: (_data, projectId) => {
      void queryClient.invalidateQueries({
        queryKey: closeoutKeys.detail(projectId),
      });
    },
  });
}

export function useUpdateCloseout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: UpdateCloseoutRequest;
    }) => apiPatch<CloseoutDetail>(closeoutPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: closeoutKeys.detail(variables.projectId),
      });
    },
  });
}

export function useUpdateCloseoutChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      itemId,
      body,
    }: {
      projectId: string;
      itemId: string;
      body: UpdateCloseoutChecklistItemRequest;
    }) =>
      apiPatch<CloseoutChecklistItem>(
        `${closeoutPath(projectId)}/checklist/${itemId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: closeoutKeys.detail(variables.projectId),
      });
    },
  });
}
