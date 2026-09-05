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
  AddConsumablesRequisitionItemPayload,
  CreateConsumablesRequisitionPayload,
  ListConsumablesRequisitionsParams,
  ConsumablesRequisitionDetail,
  ConsumablesRequisitionListItem,
  UpdateConsumablesRequisitionItemPayload,
  UpdateConsumablesRequisitionPayload,
} from '@/lib/api/consumables-requisition.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const CONSUMABLES_PATH = '/hr/consumables';

export const consumablesRequisitionKeys = {
  all: ['consumables-requisition'] as const,
  lists: () => [...consumablesRequisitionKeys.all, 'list'] as const,
  list: (params: ListConsumablesRequisitionsParams) =>
    [...consumablesRequisitionKeys.lists(), params] as const,
  details: () => [...consumablesRequisitionKeys.all, 'detail'] as const,
  detail: (id: string) =>
    [...consumablesRequisitionKeys.details(), id] as const,
};

function buildListQuery(params: ListConsumablesRequisitionsParams): string {
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
 * Loads every page for the consumables list endpoint (filter locally).
 */
async function fetchAllConsumablesRequisitionPages(
  params: Omit<
    ListConsumablesRequisitionsParams,
    'page' | 'limit' | 'search'
  > = {},
): Promise<ConsumablesRequisitionListItem[]> {
  const first = await apiGetPaginated<ConsumablesRequisitionListItem>(
    `${CONSUMABLES_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<ConsumablesRequisitionListItem>(
        `${CONSUMABLES_PATH}${buildListQuery({
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

/** All consumables requisitions (all pages) for client-side filter/search. */
export function useConsumablesRequisitionsAll(
  params: Omit<
    ListConsumablesRequisitionsParams,
    'page' | 'limit' | 'search'
  > = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...consumablesRequisitionKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllConsumablesRequisitionPages(params),
    enabled,
    retry: false,
  });
}

/** Paginated consumables requisitions. */
export function useConsumablesRequisitions(
  params: ListConsumablesRequisitionsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: consumablesRequisitionKeys.list(params),
    queryFn: () =>
      apiGetPaginated<ConsumablesRequisitionListItem>(
        `${CONSUMABLES_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<ConsumablesRequisitionListItem>>,
    enabled,
    retry: false,
  });
}

/** Single consumables requisition with items and approval tiers. */
export function useConsumablesRequisition(id: string, enabled = true) {
  return useQuery({
    queryKey: consumablesRequisitionKeys.detail(id),
    queryFn: () =>
      apiGet<ConsumablesRequisitionDetail>(`${CONSUMABLES_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Creates a new draft consumables requisition. */
export function useCreateConsumablesRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateConsumablesRequisitionPayload) =>
      apiPost<ConsumablesRequisitionDetail>(CONSUMABLES_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.lists(),
      });
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(created.id),
        created,
      );
    },
  });
}

/** Updates a draft or returned consumables requisition. */
export function useUpdateConsumablesRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateConsumablesRequisitionPayload) =>
      apiPatch<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.lists(),
      });
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Adds a line item to a draft consumables requisition. */
export function useAddConsumablesRequisitionItem(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddConsumablesRequisitionItemPayload) =>
      apiPost<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}/items`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Updates a line item on a draft consumables requisition. */
export function useUpdateConsumablesRequisitionItem(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: UpdateConsumablesRequisitionItemPayload;
    }) =>
      apiPatch<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}/items/${itemId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Removes a line item from a draft consumables requisition. */
export function useDeleteConsumablesRequisitionItem(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiDelete<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}/items/${itemId}`,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Submits a draft consumables requisition for approval. */
export function useSubmitConsumablesRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}/submit`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.lists(),
      });
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}

/** Cancels a draft or submitted consumables requisition. */
export function useCancelConsumablesRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}/cancel`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        consumablesRequisitionKeys.detail(requisitionId),
        updated,
      );
    },
  });
}
