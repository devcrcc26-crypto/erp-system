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
  apiPut,
} from '@/lib/api/client';
import type {
  EmployeePerDiemActiveCategory,
  EmployeePerDiemRate,
  ListPerDiemRequestsParams,
  PerDiemRequestDetail,
  PerDiemRequestListItem,
  SubmitPerDiemRequestPayload,
  UpsertEmployeePerDiemRatePayload,
} from '@/lib/api/per-diem.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const EMPLOYEE_RATES_PATH = '/hr/employee-per-diem-rates';
const REQUESTS_PATH = '/hr/per-diem';

export const employeePerDiemRateKeys = {
  all: ['employee-per-diem-rate'] as const,
  employee: (employeeId: string) =>
    [...employeePerDiemRateKeys.all, employeeId] as const,
  myActive: () => [...employeePerDiemRateKeys.all, 'me', 'active'] as const,
};

export const perDiemKeys = {
  all: ['per-diem'] as const,
  lists: () => [...perDiemKeys.all, 'list'] as const,
  list: (params: ListPerDiemRequestsParams) =>
    [...perDiemKeys.lists(), params] as const,
  details: () => [...perDiemKeys.all, 'detail'] as const,
  detail: (id: string) => [...perDiemKeys.details(), id] as const,
};

/** Active destination categories for the current employee (submission form). */
export function useMyActiveEmployeePerDiemCategories(enabled = true) {
  return useQuery({
    queryKey: employeePerDiemRateKeys.myActive(),
    queryFn: () =>
      apiGet<EmployeePerDiemActiveCategory[]>(`${EMPLOYEE_RATES_PATH}/me/active`),
    enabled,
    retry: false,
  });
}

/** Full per diem rate row for an employee (HR profile). */
export function useEmployeePerDiemRate(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: employeePerDiemRateKeys.employee(employeeId),
    queryFn: () =>
      apiGet<EmployeePerDiemRate>(
        `${EMPLOYEE_RATES_PATH}/employee/${employeeId}`,
      ),
    enabled: Boolean(employeeId) && enabled,
    retry: false,
  });
}

export function useUpsertEmployeePerDiemRate(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertEmployeePerDiemRatePayload) =>
      apiPut<EmployeePerDiemRate>(
        `${EMPLOYEE_RATES_PATH}/employee/${employeeId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: employeePerDiemRateKeys.employee(employeeId),
      });
      void queryClient.invalidateQueries({
        queryKey: employeePerDiemRateKeys.myActive(),
      });
      queryClient.setQueryData(
        employeePerDiemRateKeys.employee(employeeId),
        updated,
      );
    },
  });
}

function buildListQuery(params: ListPerDiemRequestsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

/** Paginated per diem requests. */
export function usePerDiemRequests(
  params: ListPerDiemRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: perDiemKeys.list(params),
    queryFn: () =>
      apiGetPaginated<PerDiemRequestListItem>(
        `${REQUESTS_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<PerDiemRequestListItem>>,
    enabled,
    retry: false,
  });
}

/** Single per diem request with approval tiers. */
export function usePerDiemRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: perDiemKeys.detail(id),
    queryFn: () => apiGet<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Submits a new per diem request. */
export function useSubmitPerDiemRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPerDiemRequestPayload) =>
      apiPost<PerDiemRequestDetail>(REQUESTS_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.setQueryData(perDiemKeys.detail(created.id), created);
    },
  });
}

/** Cancels a draft/submitted per diem request. */
export function useCancelPerDiemRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(perDiemKeys.detail(id), updated);
    },
  });
}
