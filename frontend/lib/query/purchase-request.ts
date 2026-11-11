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
  apiPatchForm,
  apiPost,
  apiPostForm,
  downloadApiFile,
} from '@/lib/api/client';
import type {
  AddPurchaseRequestItemPayload,
  CreatePurchaseRequestPayload,
  ListPurchaseRequestsParams,
  PurchaseRequestDetail,
  PurchaseRequestListItem,
  UpdatePurchaseRequestItemPayload,
  UpdatePurchaseRequestPayload,
} from '@/lib/api/purchase-request.types';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const PURCHASE_REQUEST_PATH = '/hr/purchase-requests';

export const purchaseRequestKeys = {
  all: ['purchase-request'] as const,
  lists: () => [...purchaseRequestKeys.all, 'list'] as const,
  list: (params: ListPurchaseRequestsParams) =>
    [...purchaseRequestKeys.lists(), params] as const,
  details: () => [...purchaseRequestKeys.all, 'detail'] as const,
  detail: (id: string) => [...purchaseRequestKeys.details(), id] as const,
};

function buildListQuery(params: ListPurchaseRequestsParams): string {
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
 * Loads every page for the purchase requests list endpoint (filter locally).
 */
async function fetchAllPurchaseRequestPages(
  params: Omit<ListPurchaseRequestsParams, 'page' | 'limit' | 'search'> = {},
): Promise<PurchaseRequestListItem[]> {
  const first = await apiGetPaginated<PurchaseRequestListItem>(
    `${PURCHASE_REQUEST_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<PurchaseRequestListItem>(
        `${PURCHASE_REQUEST_PATH}${buildListQuery({
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

/** All purchase requests (all pages) for client-side filter/search. */
export function usePurchaseRequestsAll(
  params: Omit<ListPurchaseRequestsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...purchaseRequestKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllPurchaseRequestPages(params),
    enabled,
    retry: false,
  });
}

/** Paginated purchase requests. */
export function usePurchaseRequests(
  params: ListPurchaseRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: purchaseRequestKeys.list(params),
    queryFn: () =>
      apiGetPaginated<PurchaseRequestListItem>(
        `${PURCHASE_REQUEST_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<PurchaseRequestListItem>>,
    enabled,
    retry: false,
  });
}

/** Single purchase request with items and approval tiers. */
export function usePurchaseRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: purchaseRequestKeys.detail(id),
    queryFn: () =>
      apiGet<PurchaseRequestDetail>(`${PURCHASE_REQUEST_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Creates a new draft purchase request. */
export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePurchaseRequestPayload) =>
      apiPost<PurchaseRequestDetail>(PURCHASE_REQUEST_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.lists(),
      });
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(created.id),
        created,
      );
    },
  });
}

/** Updates a draft or returned purchase request. */
export function useUpdatePurchaseRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePurchaseRequestPayload) =>
      apiPatch<PurchaseRequestDetail>(
        `${PURCHASE_REQUEST_PATH}/${requestId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.lists(),
      });
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(requestId),
        updated,
      );
    },
  });
}

/** Builds multipart form data for purchase request line items. */
export function buildPurchaseRequestItemFormData(
  payload: AddPurchaseRequestItemPayload | UpdatePurchaseRequestItemPayload,
): FormData {
  const formData = new FormData();
  if (payload.itemName !== undefined) {
    formData.append('itemName', payload.itemName);
  }
  if (payload.modelSpec !== undefined) {
    formData.append('modelSpec', payload.modelSpec);
  }
  if (payload.description !== undefined) {
    formData.append('description', payload.description);
  }
  if (payload.quantity !== undefined) {
    formData.append('quantity', String(payload.quantity));
  }
  if (payload.unit !== undefined) {
    formData.append('unit', payload.unit);
  }
  if (payload.unitPrice !== undefined) {
    formData.append('unitPrice', String(payload.unitPrice));
  }
  formData.append('currency', payload.currency ?? 'ETB');
  const uploadFiles =
    payload.files && payload.files.length > 0
      ? payload.files
      : payload.file
        ? [payload.file]
        : [];
  const useFilesField = Boolean(payload.files && payload.files.length > 0);
  uploadFiles.forEach((file) => {
    formData.append(useFilesField ? 'files' : 'file', file);
  });
  return formData;
}

/** Adds a line item to a draft purchase request. */
export function useAddPurchaseRequestItem(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddPurchaseRequestItemPayload) =>
      apiPostForm<PurchaseRequestDetail>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/items`,
        buildPurchaseRequestItemFormData(payload),
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(requestId),
        updated,
      );
    },
  });
}

/** Updates a line item on a draft purchase request. */
export function useUpdatePurchaseRequestItem(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: UpdatePurchaseRequestItemPayload;
    }) =>
      apiPatchForm<PurchaseRequestDetail>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/items/${itemId}`,
        buildPurchaseRequestItemFormData(payload),
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(requestId),
        updated,
      );
    },
  });
}

/** Removes a line item from a draft purchase request. */
export function useDeletePurchaseRequestItem(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiDelete<PurchaseRequestDetail>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/items/${itemId}`,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(requestId),
        updated,
      );
    },
  });
}

/** Submits a draft purchase request for approval (multipart with optional files). */
export function useSubmitPurchaseRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return apiPostForm<PurchaseRequestDetail>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/submit`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.lists(),
      });
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(requestId),
        updated,
      );
    },
  });
}

/** Cancels a draft or submitted purchase request. */
export function useCancelPurchaseRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<PurchaseRequestDetail>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/cancel`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        purchaseRequestKeys.detail(requestId),
        updated,
      );
    },
  });
}

/**
 * Loads purchase request details in batches (for list item export).
 */
export async function fetchPurchaseRequestDetails(
  requestIds: string[],
): Promise<PurchaseRequestDetail[]> {
  const results: PurchaseRequestDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < requestIds.length; index += batchSize) {
    const batch = requestIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) =>
        apiGet<PurchaseRequestDetail>(`${PURCHASE_REQUEST_PATH}/${id}`),
      ),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Preview company-wide purchase request Excel import.
 */
export function usePurchaseRequestImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${PURCHASE_REQUEST_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide purchase request Excel import.
 */
export function usePurchaseRequestImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${PURCHASE_REQUEST_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.details(),
      });
    },
  });
}

/**
 * Downloads the company-wide purchase request import template.
 */
export async function downloadPurchaseRequestImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${PURCHASE_REQUEST_PATH}/import/template`,
    'purchase-request-import-template.xlsx',
  );
}

/**
 * Preview request-scoped purchase item Excel import.
 */
export function usePurchaseRequestItemsImportPreview(requestId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/items/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit request-scoped purchase item Excel import.
 */
export function usePurchaseRequestItemsImport(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${PURCHASE_REQUEST_PATH}/${requestId}/items/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: purchaseRequestKeys.detail(requestId),
      });
    },
  });
}

/**
 * Downloads the request-scoped purchase items import template.
 */
export async function downloadPurchaseRequestItemsImportTemplate(
  requestId: string,
): Promise<void> {
  await downloadApiFile(
    `${PURCHASE_REQUEST_PATH}/${requestId}/items/import/template`,
    'purchase-request-items-import-template.xlsx',
  );
}

export async function openPurchaseRequestPdf(id: string): Promise<void> {
  const response = await apiClient.get(`${PURCHASE_REQUEST_PATH}/${id}/pdf`, { responseType: 'blob' });
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
