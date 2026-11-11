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
  RfiPriority,
  RfiProjectOption,
  RfiResponse,
  RfiStatus,
  RfiSubtaskOption,
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
    params: PaginationParams &
      PmListFilters & { status?: string; priority?: RfiPriority } = {
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
  myList: (
    params: PaginationParams &
      PmListFilters & { status?: string; priority?: RfiPriority } = {
      page: 1,
      limit: 20,
    },
  ) => [...rfiKeys.all, 'my', params] as const,
  allList: (
    params: PaginationParams &
      PmListFilters & { status?: string; priority?: RfiPriority } = {
      page: 1,
      limit: 20,
    },
  ) => [...rfiKeys.all, 'all', params] as const,
  myProjects: () => [...rfiKeys.all, 'my', 'projects'] as const,
  eligibleSubtasks: (projectId: string) =>
    [...rfiKeys.all, projectId, 'eligible-subtasks'] as const,
  previewNumber: (projectId: string, packageId: string) =>
    [...rfiKeys.all, projectId, 'preview-number', packageId] as const,
};

export function useRfis(
  projectId: string,
  params: PaginationParams &
    PmListFilters & { status?: string; priority?: RfiPriority } = {
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

export function useCloseRfi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      rfiId,
    }: {
      projectId: string;
      rfiId: string;
    }) => apiPatch<Rfi>(`${rfisPath(projectId)}/${rfiId}/close`),
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

export function useReopenRfi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      rfiId,
    }: {
      projectId: string;
      rfiId: string;
    }) => apiPatch<Rfi>(`${rfisPath(projectId)}/${rfiId}/reopen`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.detail(variables.projectId, variables.rfiId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.responses(variables.projectId, variables.rfiId),
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

/**
 * Cross-project RFIs relevant to the signed-in user.
 */
export function useMyRfis(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      priority?: RfiPriority;
    } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Rfi>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: rfiKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<Rfi>(`/rfis/my${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Company-wide RFIs (portfolio / admin users).
 */
export function useAllRfis(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      priority?: RfiPriority;
    } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Rfi>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: rfiKeys.allList(params),
    queryFn: () =>
      apiGetPaginated<Rfi>(`/rfis/all${toQueryString(params)}`),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Projects that have RFIs relevant to the current user.
 */
export function useMyRfiProjects(enabled = true) {
  return useQuery({
    queryKey: rfiKeys.myProjects(),
    queryFn: () => apiGet<RfiProjectOption[]>('/rfis/my/projects'),
    enabled,
    retry: false,
  });
}

/**
 * Design packages (subtasks) eligible for raising an RFI on the given project.
 */
export function useEligibleRfiSubtasks(projectId: string, enabled = true) {
  return useQuery({
    queryKey: rfiKeys.eligibleSubtasks(projectId),
    queryFn: () =>
      apiGet<RfiSubtaskOption[]>(
        `/projects/${projectId}/rfis/eligible-subtasks`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

/**
 * Preview the RFI number that will be assigned for the given project + package.
 */
export function usePreviewRfiNumber(
  projectId: string,
  packageId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: rfiKeys.previewNumber(projectId, packageId),
    queryFn: () =>
      apiGet<{ rfiNumber: string }>(
        `/projects/${projectId}/rfis/preview-number?packageId=${packageId}`,
      ),
    enabled: Boolean(projectId) && Boolean(packageId) && enabled,
    retry: false,
  });
}

/**
 * Link a change request to an RFI after the CR is created.
 */
export function useLinkRfiCr() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      rfiId,
      crId,
    }: {
      projectId: string;
      rfiId: string;
      crId: string;
    }) =>
      apiPatch<Rfi>(
        `${rfisPath(projectId)}/${rfiId}/link-cr`,
        { crId },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.detail(variables.projectId, variables.rfiId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.lists(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.myList(),
      });
      void queryClient.invalidateQueries({
        queryKey: rfiKeys.allList(),
      });
    },
  });
}
