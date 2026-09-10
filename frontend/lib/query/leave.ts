'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPostForm,
  downloadApiFile,
} from '@/lib/api/client';
import type {
  LeaveBalance,
  LeaveRequestDetail,
  LeaveRequestListItem,
  EmployeeLeaveBalanceSummary,
  ListLeaveBalancesParams,
  ListLeaveRequestsParams,
  SubmitLeaveRequestPayload,
  UpdateLeaveRequestPayload,
} from '@/lib/api/leave.types';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
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
  companyBalances: (params: ListLeaveBalancesParams) =>
    [...leaveKeys.balances(), 'company', params] as const,
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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for a leave list endpoint (no client search — filter locally).
 */
async function fetchAllLeaveRequestPages(
  path: string,
  params: Omit<ListLeaveRequestsParams, 'page' | 'limit' | 'search'>,
): Promise<LeaveRequestListItem[]> {
  const first = await apiGetPaginated<LeaveRequestListItem>(
    `${path}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<LeaveRequestListItem>(
        `${path}${buildListQuery({
          ...params,
          page: index + 2,
          limit: FETCH_PAGE_SIZE,
        })}`,
      ),
    ),
  );

  for (const page of rest) {
    all.push(...page.data);
  }
  return all;
}

/**
 * Loads every page of company leave balances for a year.
 */
async function fetchAllLeaveBalancePages(
  params: Omit<ListLeaveBalancesParams, 'page' | 'limit' | 'search'>,
): Promise<EmployeeLeaveBalanceSummary[]> {
  const first = await apiGetPaginated<EmployeeLeaveBalanceSummary>(
    `${LEAVE_PATH}/balances${toQueryString({
      ...params,
      page: 1,
      limit: FETCH_PAGE_SIZE,
    })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<EmployeeLeaveBalanceSummary>(
        `${LEAVE_PATH}/balances${toQueryString({
          ...params,
          page: index + 2,
          limit: FETCH_PAGE_SIZE,
        })}`,
      ),
    ),
  );

  for (const page of rest) {
    all.push(...page.data);
  }
  return all;
}

/**
 * Company-wide leave requests (all pages) for client-side filter/search.
 */
export function useLeaveRequestsAll(
  params: Omit<ListLeaveRequestsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...leaveKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllLeaveRequestPages(LEAVE_PATH, params),
    enabled,
    retry: false,
  });
}

/**
 * Current user's leave requests (all pages) for client-side filter/search.
 */
export function useMyLeaveRequestsAll(
  params: Omit<ListLeaveRequestsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...leaveKeys.myLists(), 'all', params] as const,
    queryFn: () => fetchAllLeaveRequestPages(`${LEAVE_PATH}/my`, params),
    enabled,
    retry: false,
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
 * Company-wide leave balances for HR (annual, maternity, sick).
 */
export function useLeaveBalances(
  params: ListLeaveBalancesParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: leaveKeys.companyBalances(params),
    queryFn: () =>
      apiGetPaginated<EmployeeLeaveBalanceSummary>(
        `${LEAVE_PATH}/balances${toQueryString(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * All company leave balances for a year (for client-side search/filter).
 */
export function useLeaveBalancesAll(
  params: Omit<ListLeaveBalancesParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...leaveKeys.balances(), 'company', 'all', params] as const,
    queryFn: () => fetchAllLeaveBalancePages(params),
    enabled,
    retry: false,
  });
}

/**
 * Submits a leave request (multipart when files are attached).
 */
export function useSubmitLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitLeaveRequestPayload) => {
      const formData = new FormData();
      formData.append('leaveType', payload.leaveType);
      if (payload.periods && payload.periods.length > 0) {
        formData.append('periods', JSON.stringify(payload.periods));
      }
      if (payload.startDate) {
        formData.append('startDate', payload.startDate);
      }
      if (payload.endDate) {
        formData.append('endDate', payload.endDate);
      }
      if (payload.days != null) {
        formData.append('days', String(payload.days));
      }
      formData.append('reason', payload.reason ?? '');
      for (const file of payload.files ?? []) {
        formData.append('files', file);
      }
      return apiPostForm<LeaveRequestDetail>(LEAVE_PATH, formData);
    },
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

/**
 * Updates a draft or returned leave request.
 */
export function useUpdateLeaveRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateLeaveRequestPayload) =>
      apiPatch<LeaveRequestDetail>(`${LEAVE_PATH}/${id}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myLists() });
      void queryClient.setQueryData(leaveKeys.detail(id), updated);
    },
  });
}

/**
 * Soft-deletes a leave request (HR only).
 */
export function useDeleteLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`${LEAVE_PATH}/${id}`),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myLists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balances() });
      void queryClient.removeQueries({ queryKey: leaveKeys.detail(id) });
    },
  });
}

/**
 * Preview leave request Excel import without writing.
 */
export function useLeaveRequestImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${LEAVE_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit leave request Excel import (submits on behalf of employees).
 */
export function useLeaveRequestImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(`${LEAVE_PATH}/import`, formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.myLists() });
      void queryClient.invalidateQueries({ queryKey: leaveKeys.balances() });
    },
  });
}

/**
 * Downloads the leave request import template.
 */
export async function downloadLeaveRequestImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${LEAVE_PATH}/import/template`,
    'leave-request-import-template.xlsx',
  );
}
