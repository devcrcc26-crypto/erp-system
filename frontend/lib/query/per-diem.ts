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
  apiPost,
} from '@/lib/api/client';
import type {
  CreatePerDiemRatePayload,
  ListPerDiemRequestsParams,
  PerDiemRate,
  PerDiemRequestDetail,
  PerDiemRequestListItem,
  SubmitPerDiemRequestPayload,
  UpdatePerDiemRatePayload,
} from '@/lib/api/per-diem.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const RATES_PATH = '/hr/per-diem-rates';
const REQUESTS_PATH = '/hr/per-diem';

export const perDiemRateKeys = {
  all: ['per-diem-rate'] as const,
  list: () => [...perDiemRateKeys.all, 'list'] as const,
  active: () => [...perDiemRateKeys.all, 'active'] as const,
};

export const perDiemKeys = {
  all: ['per-diem'] as const,
  lists: () => [...perDiemKeys.all, 'list'] as const,
  list: (params: ListPerDiemRequestsParams) =>
    [...perDiemKeys.lists(), params] as const,
  details: () => [...perDiemKeys.all, 'detail'] as const,
  detail: (id: string) => [...perDiemKeys.details(), id] as const,
};

// ─── Rates (HR config) ──────────────────────────────────────────────────────

/** All per diem rates (HR management table). */
export function usePerDiemRates(enabled = true) {
  return useQuery({
    queryKey: perDiemRateKeys.list(),
    queryFn: () => apiGet<PerDiemRate[]>(RATES_PATH),
    enabled,
    retry: false,
  });
}

/** Active per diem rates (submission form dropdown; any authenticated user). */
export function useActivePerDiemRates(enabled = true) {
  return useQuery({
    queryKey: perDiemRateKeys.active(),
    queryFn: () => apiGet<PerDiemRate[]>(`${RATES_PATH}/active`),
    enabled,
    retry: false,
  });
}

export function useCreatePerDiemRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePerDiemRatePayload) =>
      apiPost<PerDiemRate>(RATES_PATH, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: perDiemRateKeys.all });
    },
  });
}

export function useUpdatePerDiemRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdatePerDiemRatePayload;
    }) => apiPatch<PerDiemRate>(`${RATES_PATH}/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: perDiemRateKeys.all });
    },
  });
}

export function useDeletePerDiemRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ message: string }>(`${RATES_PATH}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: perDiemRateKeys.all });
    },
  });
}

// ─── Requests ───────────────────────────────────────────────────────────────

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
