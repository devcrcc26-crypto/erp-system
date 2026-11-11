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
  CreateDeliverableDto,
  Deliverable,
  DeliverableStatus,
  PmListFilters,
  UpdateDeliverableDto,
} from '@/lib/api/project-management.types';
import type { MessageResponse, PaginationMeta, PaginationParams } from '@/lib/api/types';
import { projectPath, toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const deliverablesPath = (projectId: string): string =>
  projectPath(projectId, 'deliverables');

export const deliverableKeys = {
  all: ['pm', 'deliverables'] as const,
  lists: (projectId: string) =>
    [...deliverableKeys.all, projectId, 'list'] as const,
  list: (
    projectId: string,
    params: PaginationParams &
      PmListFilters & { disciplineId?: string; status?: DeliverableStatus } = {
      page: 1,
      limit: 20,
    },
  ) => [...deliverableKeys.lists(projectId), params] as const,
  details: (projectId: string) =>
    [...deliverableKeys.all, projectId, 'detail'] as const,
  detail: (projectId: string, deliverableId: string) =>
    [...deliverableKeys.details(projectId), deliverableId] as const,
};

export function useDeliverables(
  projectId: string,
  params: PaginationParams &
    PmListFilters & { disciplineId?: string; status?: DeliverableStatus } = {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  enabled = true,
  options?: Omit<
    UseQueryOptions<PaginatedResult<Deliverable>>,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: deliverableKeys.list(projectId, params),
    queryFn: () =>
      apiGetPaginated<Deliverable>(
        `${deliverablesPath(projectId)}${toQueryString(params)}`,
      ),
    enabled: Boolean(projectId) && enabled,
    retry: false,
    ...options,
  });
}

export function useDeliverable(
  projectId: string,
  deliverableId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: deliverableKeys.detail(projectId, deliverableId),
    queryFn: () =>
      apiGet<Deliverable>(
        `${deliverablesPath(projectId)}/${deliverableId}`,
      ),
    enabled: Boolean(projectId) && Boolean(deliverableId) && enabled,
    retry: false,
  });
}

export function useDeliverableActiveCount(projectId: string, enabled = true) {
  return useQuery({
    queryKey: [...deliverableKeys.lists(projectId), 'active-count'] as const,
    queryFn: async (): Promise<number> => {
      const result = await apiGetPaginated<Deliverable>(
        `${deliverablesPath(projectId)}${toQueryString({
          page: 1,
          limit: 100,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })}`,
      );
      return result.data.filter(
        (row) => row.status === 'IN_PROGRESS' || row.status === 'SUBMITTED',
      ).length;
    },
    enabled: Boolean(projectId) && enabled,
    retry: false,
  });
}

export function useCreateDeliverable(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateDeliverableDto) =>
      apiPost<Deliverable>(deliverablesPath(projectId), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: deliverableKeys.lists(projectId),
      });
    },
  });
}

export function useUpdateDeliverable(
  projectId: string,
  deliverableId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateDeliverableDto) =>
      apiPatch<Deliverable>(
        `${deliverablesPath(projectId)}/${deliverableId}`,
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: deliverableKeys.lists(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: deliverableKeys.detail(projectId, deliverableId),
      });
    },
  });
}

export function useDeleteDeliverable(
  projectId: string,
  deliverableId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiDelete<MessageResponse>(
        `${deliverablesPath(projectId)}/${deliverableId}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: deliverableKeys.lists(projectId),
      });
    },
  });
}
