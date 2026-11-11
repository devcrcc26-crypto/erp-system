'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiClient,
  apiDelete,
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  apiPostForm,
  downloadApiFile,
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
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
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

/** Submits a draft consumables requisition for approval (multipart with optional files). */
export function useSubmitConsumablesRequisition(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[] = []) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return apiPostForm<ConsumablesRequisitionDetail>(
        `${CONSUMABLES_PATH}/${requisitionId}/submit`,
        formData,
      );
    },
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

/**
 * Loads consumables requisition details in batches (for list item export).
 */
export async function fetchConsumablesRequisitionDetails(
  requisitionIds: string[],
): Promise<ConsumablesRequisitionDetail[]> {
  const results: ConsumablesRequisitionDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < requisitionIds.length; index += batchSize) {
    const batch = requisitionIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) =>
        apiGet<ConsumablesRequisitionDetail>(`${CONSUMABLES_PATH}/${id}`),
      ),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Preview company-wide consumables requisition Excel import.
 */
export function useConsumablesRequisitionImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${CONSUMABLES_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide consumables requisition Excel import.
 */
export function useConsumablesRequisitionImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${CONSUMABLES_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.details(),
      });
    },
  });
}

/**
 * Downloads the company-wide consumables requisition import template.
 */
export async function downloadConsumablesRequisitionImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${CONSUMABLES_PATH}/import/template`,
    'consumables-requisition-import-template.xlsx',
  );
}

/**
 * Preview requisition-scoped item Excel import.
 */
export function useConsumablesRequisitionItemsImportPreview(
  requisitionId: string,
) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${CONSUMABLES_PATH}/${requisitionId}/items/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit requisition-scoped item Excel import.
 */
export function useConsumablesRequisitionItemsImport(requisitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${CONSUMABLES_PATH}/${requisitionId}/items/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: consumablesRequisitionKeys.detail(requisitionId),
      });
    },
  });
}

/**
 * Downloads the requisition-scoped items import template.
 */
export async function downloadConsumablesRequisitionItemsImportTemplate(
  requisitionId: string,
): Promise<void> {
  await downloadApiFile(
    `${CONSUMABLES_PATH}/${requisitionId}/items/import/template`,
    'consumables-requisition-items-import-template.xlsx',
  );
}

export async function openConsumablesRequisitionPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${CONSUMABLES_PATH}/${id}/pdf`, { responseType: 'blob' });
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
