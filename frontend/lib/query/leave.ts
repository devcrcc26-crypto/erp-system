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
  LeaveBalance,
  LeaveRequestDetail,
  LeaveRequestListItem,
  ListLeaveRequestsParams,
  SubmitLeaveRequestPayload,
} from '@/lib/api/leave.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const LEAVE_PATH = '/hr/leave-requests';

export const leaveKeys = {
  all: ['leave'] as const,
  lists: () => [...leaveKeys.all, 'list'] as const,
  list: (params: ListLeaveRequestsParams) =>
    [...leaveKeys.lists(), params] as const,
  myLists: () => [...leaveKeys.all, 'my'] as const,
  myList: (params: ListLeaveRequestsParams) =>
    [...leaveKeys.myLists(), params] as const,
  details: () => [...leaveKeys.all, 'detail'] as const,
  detail: (id: string) => [...leaveKeys.details(), id] as const,
  balances: () => [...leaveKeys.all, 'balances'] as const,
  myBalances: (year: number) => [...leaveKeys.balances(), 'me', year] as const,
};

function buildListQuery(params: ListLeaveRequestsParams): string {
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
 * Paginated leave requests (company-wide).
 */
export function useLeaveRequests(
  params: ListLeaveRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: leaveKeys.list(params),
    queryFn: () =>
      apiGetPaginated<LeaveRequestListItem>(
        `${LEAVE_PATH}${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Current user's leave requests.
 */
export function useMyLeaveRequests(
  params: ListLeaveRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: leaveKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<LeaveRequestListItem>(
        `${LEAVE_PATH}/my${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Single leave request with approval tiers.
 */
export function useLeaveRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: leaveKeys.detail(id),
    queryFn: () => apiGet<LeaveRequestDetail>(`${LEAVE_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/**
 * Current user's leave balances for a calendar year (auth-only endpoint).
 */
export function useMyLeaveBalances(year: number, enabled = true) {
  return useQuery({
    queryKey: leaveKeys.myBalances(year),
    queryFn: () =>
      apiGet<LeaveBalance[]>(`${LEAVE_PATH}/balance?year=${year}`),
    enabled,
    retry: false,
  });
}

/**
 * Submits a leave request.
 */
export function useSubmitLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitLeaveRequestPayload) =>
      apiPost<LeaveRequestDetail>(LEAVE_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myLists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balances() });
      void queryClient.setQueryData(leaveKeys.detail(created.id), created);
    },
  });
}

/**
 * Cancels a draft/submitted leave request.
 */
export function useCancelLeaveRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPatch<LeaveRequestDetail>(`${LEAVE_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myLists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balances() });
      void queryClient.setQueryData(leaveKeys.detail(id), updated);
    },
  });
}
