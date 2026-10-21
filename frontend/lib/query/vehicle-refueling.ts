'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiClient,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type {
  ListVehicleRefuelingsParams,
  SubmitVehicleRefuelingPayload,
  VehicleRefuelingDetail,
  VehicleRefuelingListItem,
} from '@/lib/api/vehicle-refueling.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const REFUELING_PATH = '/hr/vehicle-refueling';

export const vehicleRefuelingKeys = {
  all: ['vehicle-refueling'] as const,
  lists: () => [...vehicleRefuelingKeys.all, 'list'] as const,
  list: (params: ListVehicleRefuelingsParams) =>
    [...vehicleRefuelingKeys.lists(), params] as const,
  details: () => [...vehicleRefuelingKeys.all, 'detail'] as const,
  detail: (id: string) =>
    [...vehicleRefuelingKeys.details(), id] as const,
};

function buildListQuery(params: ListVehicleRefuelingsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the vehicle refueling list (filter locally).
 */
async function fetchAllVehicleRefuelingPages(
  params: Omit<
    ListVehicleRefuelingsParams,
    'page' | 'limit' | 'search'
  > = {},
): Promise<VehicleRefuelingListItem[]> {
  const first = await apiGetPaginated<VehicleRefuelingListItem>(
    `${REFUELING_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<VehicleRefuelingListItem>(
        `${REFUELING_PATH}${buildListQuery({
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

export function useVehicleRefuelings(
  params: ListVehicleRefuelingsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: vehicleRefuelingKeys.list(params),
    queryFn: () =>
      apiGetPaginated<VehicleRefuelingListItem>(
        `${REFUELING_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<VehicleRefuelingListItem>>,
    enabled,
    retry: false,
  });
}

/** All vehicle refueling requests (all pages) for client-side filter/search. */
export function useVehicleRefuelingsAll(
  params: Omit<
    ListVehicleRefuelingsParams,
    'page' | 'limit' | 'search'
  > = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...vehicleRefuelingKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllVehicleRefuelingPages(params),
    enabled,
    retry: false,
  });
}

export function useVehicleRefueling(id: string, enabled = true) {
  return useQuery({
    queryKey: vehicleRefuelingKeys.detail(id),
    queryFn: () =>
      apiGet<VehicleRefuelingDetail>(`${REFUELING_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useSubmitVehicleRefueling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitVehicleRefuelingPayload) =>
      apiPost<VehicleRefuelingDetail>(REFUELING_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleRefuelingKeys.lists(),
      });
      void queryClient.setQueryData(
        vehicleRefuelingKeys.detail(created.id),
        created,
      );
    },
  });
}

export function useCancelVehicleRefueling(refuelingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<VehicleRefuelingDetail>(
        `${REFUELING_PATH}/${refuelingId}/cancel`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleRefuelingKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        vehicleRefuelingKeys.detail(refuelingId),
        updated,
      );
    },
  });
}

export function useUploadRefuelingReceipt(refuelingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPost<VehicleRefuelingDetail>(
        `${REFUELING_PATH}/${refuelingId}/receipt`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: vehicleRefuelingKeys.lists(),
      });
      void queryClient.setQueryData(
        vehicleRefuelingKeys.detail(refuelingId),
        updated,
      );
    },
  });
}

export async function openVehicleRefuelingPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${REFUELING_PATH}/${id}/pdf`, { responseType: 'blob' });
  const contentType = response.headers['content-type'];
  const blob = new Blob([response.data as BlobPart], {
    type: typeof contentType === 'string' && contentType.includes('pdf') ? contentType : 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
