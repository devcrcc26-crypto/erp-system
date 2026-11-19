'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiGetPaginated, apiPatch, apiPost } from '@/lib/api/client';
import type {
  AssetRequestDetail,
  AssetRequestListItem,
  CreateAssetRequestPayload,
  FulfillAssetRequestPayload,
  ListAssetRequestsParams,
  UpdateAssetRequestPayload,
} from '@/lib/api/asset-request.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const ASSET_REQUEST_PATH = '/hr/asset-requests';

export const assetRequestKeys = {
  all: ['asset-request'] as const,
  lists: () => [...assetRequestKeys.all, 'list'] as const,
  list: (params: ListAssetRequestsParams) => [...assetRequestKeys.lists(), params] as const,
  details: () => [...assetRequestKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetRequestKeys.details(), id] as const,
};

function buildListQuery(params: ListAssetRequestsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

export function useAssetRequests(params: ListAssetRequestsParams = {}) {
  return useQuery<PaginatedResult<AssetRequestListItem>>({
    queryKey: assetRequestKeys.list(params),
    queryFn: () =>
      apiGetPaginated<AssetRequestListItem>(
        `${ASSET_REQUEST_PATH}${buildListQuery(params)}`,
      ),
  });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the asset-request list endpoint (filter locally).
 */
async function fetchAllAssetRequestPages(
  params: Omit<ListAssetRequestsParams, 'page' | 'limit' | 'search' | 'status'> = {},
): Promise<AssetRequestListItem[]> {
  const first = await apiGetPaginated<AssetRequestListItem>(
    `${ASSET_REQUEST_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<AssetRequestListItem>(
        `${ASSET_REQUEST_PATH}${buildListQuery({
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

/** All asset requests (all pages) for client-side filter/search. */
export function useAssetRequestsAll(
  params: Omit<ListAssetRequestsParams, 'page' | 'limit' | 'search' | 'status'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...assetRequestKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllAssetRequestPages(params),
    enabled,
    retry: false,
  });
}

export function useAssetRequest(id: string) {
  return useQuery<AssetRequestDetail>({
    queryKey: assetRequestKeys.detail(id),
    queryFn: () => apiGet<AssetRequestDetail>(`${ASSET_REQUEST_PATH}/${id}`),
    enabled: !!id,
  });
}

export function useCreateAssetRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAssetRequestPayload) =>
      apiPost<AssetRequestDetail>(ASSET_REQUEST_PATH, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.lists() });
    },
  });
}

export function useUpdateAssetRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAssetRequestPayload) =>
      apiPatch<AssetRequestDetail>(`${ASSET_REQUEST_PATH}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.lists() });
    },
  });
}

export function useSubmitAssetRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<AssetRequestDetail>(`${ASSET_REQUEST_PATH}/${id}/submit`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.lists() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}

export function useCancelAssetRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPatch<AssetRequestDetail>(`${ASSET_REQUEST_PATH}/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.lists() });
    },
  });
}

export function useFulfillAssetRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FulfillAssetRequestPayload) =>
      apiPost<AssetRequestDetail>(`${ASSET_REQUEST_PATH}/${id}/fulfill`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetRequestKeys.lists() });
    },
  });
}
