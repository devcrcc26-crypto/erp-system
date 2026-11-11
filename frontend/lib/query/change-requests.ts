// Gap completion - new

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
  CrProjectOption,
  CrSubtaskOption,
  CurrentEdvOption,
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
      PmListFilters & {
        status?: string;
        linkedDesignPackageId?: string;
      } = {
      page: 1,
      limit: 20,
    },
  ) => [...changeRequestKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...changeRequestKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, changeRequestId: string) =>
    [...changeRequestKeys.details(projectId), changeRequestId] as const,
  myList: (
    params: PaginationParams &
      PmListFilters & {
        status?: string;
      } = {
      page: 1,
      limit: 20,
    },
  ) => [...changeRequestKeys.all, 'my', params] as const,
  allList: (
    params: PaginationParams &
      PmListFilters & {
        status?: string;
      } = {
      page: 1,
      limit: 20,
    },
  ) => [...changeRequestKeys.all, 'all', params] as const,
  myProjects: () => [...changeRequestKeys.all, 'my', 'projects'] as const,
  eligibleSubtasks: (projectId: string) =>
    [...changeRequestKeys.all, projectId, 'eligible-subtasks'] as const,
  currentEdvs: (packageId: string) =>
    [...changeRequestKeys.all, 'current-edvs', packageId] as const,
  nextCrNumber: (packageId: string) =>
    [...changeRequestKeys.all, 'next-cr-number', packageId] as const,
};

export function useChangeRequests(
  projectId: string,
  params: PaginationParams &
    PmListFilters & {
      status?: string;
      linkedDesignPackageId?: string;
    } = {
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

/**
 * Cross-project change requests relevant to the signed-in user.
 */
export function useMyChangeRequests(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
    } = {
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
    queryKey: changeRequestKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<ProjectChangeRequest>(
        `/change-requests/my${toQueryString(params)}`,
      ),
    enabled,
    retry: false,
    ...options,
  });
}

/**
 * Company-wide change requests (portfolio / admin users).
 */
export function useAllChangeRequests(
  params: PaginationParams &
    PmListFilters & {
      status?: string;
    } = {
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
    queryKey: changeRequestKeys.allList(params),
    queryFn: () =>
      apiGetPaginated<ProjectChangeRequest>(
        `/change-requests/all${toQueryString(params)}`,
      ),
    enabled,
    retry: false,
    ...options,
  });
}

export function useMyChangeRequestProjects(enabled = true) {
  return useQuery({
    queryKey: changeRequestKeys.myProjects(),
    queryFn: () => apiGet<CrProjectOption[]>('/change-requests/my/projects'),
    enabled,
    retry: false,
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

export function useEligibleCrSubtasks(projectId: string, enabled = true) {
  return useQuery({
    queryKey: changeRequestKeys.eligibleSubtasks(projectId),
    queryFn: () =>
      apiGet<CrSubtaskOption[]>(
        `${changeRequestsPath(projectId)}/eligible-subtasks`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

export function usePackageCurrentEdvs(packageId: string, enabled = true) {
  return useQuery({
    queryKey: changeRequestKeys.currentEdvs(packageId),
    queryFn: () =>
      apiGet<CurrentEdvOption[]>(
        `/design-packages/${packageId}/current-edvs`,
      ),
    enabled: Boolean(packageId) && enabled,
    retry: false,
  });
}

export function useNextCrNumber(packageId: string, enabled = true) {
  return useQuery({
    queryKey: changeRequestKeys.nextCrNumber(packageId),
    queryFn: () =>
      apiGet<{ changeNumber: string }>(
        `/design-packages/${packageId}/next-cr-number`,
      ),
    enabled: Boolean(packageId) && enabled,
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
      void queryClient.invalidateQueries({
        queryKey: changeRequestKeys.all,
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

export function useSubmitChangeRequest(
  projectId: string,
  changeRequestId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPatch<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}/${changeRequestId}/submit`,
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

export function useRecallChangeRequest(
  projectId: string,
  changeRequestId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiPatch<ProjectChangeRequest>(
        `${changeRequestsPath(projectId)}/${changeRequestId}/recall`,
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
