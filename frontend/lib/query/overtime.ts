'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type {
  ListOvertimeRequestsParams,
  OvertimeRequestDetail,
  OvertimeRequestListItem,
  SubmitOvertimeRequestPayload,
} from '@/lib/api/overtime.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const OVERTIME_PATH = '/hr/overtime';

export const overtimeKeys = {
  all: ['overtime'] as const,
  lists: () => [...overtimeKeys.all, 'list'] as const,
  list: (params: ListOvertimeRequestsParams) =>
    [...overtimeKeys.lists(), params] as const,
  myLists: () => [...overtimeKeys.all, 'my'] as const,
  myList: (params: ListOvertimeRequestsParams) =>
    [...overtimeKeys.myLists(), params] as const,
  details: () => [...overtimeKeys.all, 'detail'] as const,
  detail: (id: string) => [...overtimeKeys.details(), id] as const,
};

function buildListQuery(params: ListOvertimeRequestsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({
    ...rest,
    status: statusValue,
  });
}

/**
 * Paginated overtime requests (company-wide).
 */
export function useOvertimeRequests(
  params: ListOvertimeRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: overtimeKeys.list(params),
    queryFn: () =>
      apiGetPaginated<OvertimeRequestListItem>(
        `${OVERTIME_PATH}${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Current user's overtime requests.
 */
export function useMyOvertimeRequests(
  params: ListOvertimeRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: overtimeKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<OvertimeRequestListItem>(
        `${OVERTIME_PATH}/my${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Single overtime request with approval tiers.
 */
export function useOvertimeRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: overtimeKeys.detail(id),
    queryFn: () => apiGet<OvertimeRequestDetail>(`${OVERTIME_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/**
 * Submits an overtime request.
 */
export function useSubmitOvertimeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitOvertimeRequestPayload) =>
      apiPost<OvertimeRequestDetail>(OVERTIME_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.myLists() });
      void queryClient.setQueryData(overtimeKeys.detail(created.id), created);
    },
  });
}

/**
 * Cancels a draft/submitted overtime request.
 */
export function useCancelOvertimeRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<OvertimeRequestDetail>(`${OVERTIME_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.myLists() });
      void queryClient.setQueryData(overtimeKeys.detail(id), updated);
    },
  });
}
