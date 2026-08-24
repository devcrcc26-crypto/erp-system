'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
