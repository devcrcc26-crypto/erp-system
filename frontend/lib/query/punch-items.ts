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
  CreatePunchItemRequest,
  PunchItem,
  PunchItemSeverity,
  PmListFilters,
  UpdatePunchItemRequest,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const punchItemsPath = (projectId: string): string =>
  projectPath(projectId, 'punch-items');

export const punchItemKeys = {
  all: ['pm', 'punch-items'] as const,
  lists: (projectId: string) =>
    [...punchItemKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams &
      PmListFilters & {
        status?: string;
        severity?: PunchItemSeverity;
        category?: string;
      } = {
      page: 1,
      limit: 20,
    },
  ) => [...punchItemKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...punchItemKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, punchItemId: string) =>
    [...punchItemKeys.details(projectId), punchItemId] as const,
  globalLists: () => [...punchItemKeys.all, 'global'] as const,
  globalList: (
    params: PaginationParams &
      PmListFilters & {
        status?: string;
        severity?: PunchItemSeverity;
        category?: string;
      } = {
      page: 1,
      limit: 20,
    },
  ) => [...punchItemKeys.globalLists(), params] as const,
};

export function usePunchItems(
  projectId: string,
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      severity?: PunchItemSeverity;
      category?: string;
    } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<PunchItem>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: punchItemKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<PunchItem>(
        `${punchItemsPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useAllPunchItems(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      severity?: PunchItemSeverity;
      category?: string;
    } = {
    page: 1,
    limit: 20,
  },
  enabled = true,
) {
  return useQuery({
    queryKey: punchItemKeys.globalList(params),
    queryFn: () =>
      apiGetPaginated<PunchItem>(`/punch-items/all${toQueryString(params)}`),
    enabled,
    retry: false,
  });
}

export function usePunchItem(
  projectId: string,
  punchItemId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: punchItemKeys.detail(projectId, punchItemId),
    queryFn: () =>
      apiGet<PunchItem>(`${punchItemsPath(projectId)}/${punchItemId}`),
    enabled: Boolean(projectId) && Boolean(punchItemId) && enabled,
    retry: false,
  });
}

export function useCreatePunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      body,
    }: {
      projectId: string;
      body: CreatePunchItemRequest;
    }) => apiPost<PunchItem>(punchItemsPath(projectId), body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: punchItemKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: punchItemKeys.globalLists(),
      });
    },
  });
}

export function useUpdatePunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
      body,
    }: {
      projectId: string;
      punchItemId: string;
      body: UpdatePunchItemRequest;
    }) =>
      apiPatch<PunchItem>(
        `${punchItemsPath(projectId)}/${punchItemId}`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: punchItemKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: punchItemKeys.detail(
          variables.projectId,
          variables.punchItemId,
        ),
      });
    },
  });
}

export function useDeletePunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
    }: {
      projectId: string;
      punchItemId: string;
    }) =>
      apiDelete<MessageResponse>(
        `${punchItemsPath(projectId)}/${punchItemId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: punchItemKeys.lists(variables.projectId),
      });
    },
  });
}

function invalidatePunchItemQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  punchItemId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: punchItemKeys.lists(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: punchItemKeys.detail(projectId, punchItemId),
  });
  void queryClient.invalidateQueries({
    queryKey: punchItemKeys.globalLists(),
  });
  void queryClient.invalidateQueries({
    queryKey: punchItemKeys.all,
  });
}

export function useAssignPunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
      assignedTo,
    }: {
      projectId: string;
      punchItemId: string;
      assignedTo: string;
    }) =>
      apiPost<PunchItem>(
        `${punchItemsPath(projectId)}/${punchItemId}/assign`,
        { assignedTo },
      ),
    onSuccess: (_data, variables) => {
      invalidatePunchItemQueries(
        queryClient,
        variables.projectId,
        variables.punchItemId,
      );
    },
  });
}

export function useCorrectPunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
      resolutionNote,
    }: {
      projectId: string;
      punchItemId: string;
      resolutionNote: string;
    }) =>
      apiPost<PunchItem>(
        `${punchItemsPath(projectId)}/${punchItemId}/correct`,
        { resolutionNote },
      ),
    onSuccess: (_data, variables) => {
      invalidatePunchItemQueries(
        queryClient,
        variables.projectId,
        variables.punchItemId,
      );
    },
  });
}

export function useVerifyPunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
    }: {
      projectId: string;
      punchItemId: string;
    }) =>
      apiPost<PunchItem>(
        `${punchItemsPath(projectId)}/${punchItemId}/verify`,
        {},
      ),
    onSuccess: (_data, variables) => {
      invalidatePunchItemQueries(
        queryClient,
        variables.projectId,
        variables.punchItemId,
      );
    },
  });
}

export function useClosePunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
    }: {
      projectId: string;
      punchItemId: string;
    }) =>
      apiPost<PunchItem>(
        `${punchItemsPath(projectId)}/${punchItemId}/close`,
        {},
      ),
    onSuccess: (_data, variables) => {
      invalidatePunchItemQueries(
        queryClient,
        variables.projectId,
        variables.punchItemId,
      );
    },
  });
}

export function useReopenPunchItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      punchItemId,
      reason,
    }: {
      projectId: string;
      punchItemId: string;
      reason?: string;
    }) =>
      apiPost<PunchItem>(
        `${punchItemsPath(projectId)}/${punchItemId}/reopen`,
        reason?.trim() ? { reason: reason.trim() } : {},
      ),
    onSuccess: (_data, variables) => {
      invalidatePunchItemQueries(
        queryClient,
        variables.projectId,
        variables.punchItemId,
      );
    },
  });
}
