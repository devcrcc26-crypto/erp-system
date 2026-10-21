'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiClient,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
} from '@/lib/api/client';
import type {
  InspectionRepairAssetSummary,
  InspectionRepairDetail,
  InspectionRepairListItem,
  ListInspectionRepairsParams,
  SubmitInspectionRepairPayload,
  UpdateInspectionRepairPayload,
} from '@/lib/api/inspection-repair.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const INSPECTION_REPAIR_PATH = '/hr/inspection-repair';

export const inspectionRepairKeys = {
  all: ['inspection-repair'] as const,
  lists: () => [...inspectionRepairKeys.all, 'list'] as const,
  list: (params: ListInspectionRepairsParams) =>
    [...inspectionRepairKeys.lists(), params] as const,
  details: () => [...inspectionRepairKeys.all, 'detail'] as const,
  detail: (id: string) => [...inspectionRepairKeys.details(), id] as const,
  myAssets: () => [...inspectionRepairKeys.all, 'my-assets'] as const,
};

function buildListQuery(params: ListInspectionRepairsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

export function useInspectionRepairs(
  params: ListInspectionRepairsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: inspectionRepairKeys.list(params),
    queryFn: () =>
      apiGetPaginated<InspectionRepairListItem>(
        `${INSPECTION_REPAIR_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<InspectionRepairListItem>>,
    enabled,
    retry: false,
  });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the inspection & repair list (filter locally).
 */
async function fetchAllInspectionRepairPages(
  params: Omit<
    ListInspectionRepairsParams,
    'page' | 'limit' | 'search'
  > = {},
): Promise<InspectionRepairListItem[]> {
  const first = await apiGetPaginated<InspectionRepairListItem>(
    `${INSPECTION_REPAIR_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<InspectionRepairListItem>(
        `${INSPECTION_REPAIR_PATH}${buildListQuery({
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

/** All inspection & repair requests (all pages) for client-side filter/search. */
export function useInspectionRepairsAll(
  params: Omit<
    ListInspectionRepairsParams,
    'page' | 'limit' | 'search'
  > = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...inspectionRepairKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllInspectionRepairPages(params),
    enabled,
    retry: false,
  });
}

export function useInspectionRepair(id: string, enabled = true) {
  return useQuery({
    queryKey: inspectionRepairKeys.detail(id),
    queryFn: () =>
      apiGet<InspectionRepairDetail>(`${INSPECTION_REPAIR_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

export function useMyInspectionRepairAssets(enabled = true) {
  return useQuery({
    queryKey: inspectionRepairKeys.myAssets(),
    queryFn: () =>
      apiGet<InspectionRepairAssetSummary[]>(
        `${INSPECTION_REPAIR_PATH}/my-assets`,
      ),
    enabled,
    retry: false,
  });
}

export function useSubmitInspectionRepair() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitInspectionRepairPayload) =>
      apiPost<InspectionRepairDetail>(INSPECTION_REPAIR_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: inspectionRepairKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        inspectionRepairKeys.detail(created.id),
        created,
      );
    },
  });
}

export function useUpdateInspectionRepair(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateInspectionRepairPayload) =>
      apiPatch<InspectionRepairDetail>(
        `${INSPECTION_REPAIR_PATH}/${id}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: inspectionRepairKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(inspectionRepairKeys.detail(id), updated);
    },
  });
}

export function useCancelInspectionRepair(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<{ success: boolean }>(`${INSPECTION_REPAIR_PATH}/${id}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: inspectionRepairKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
    },
  });
}

export async function openInspectionRepairPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${INSPECTION_REPAIR_PATH}/${id}/pdf`, { responseType: 'blob' });
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
