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
  apiPatchForm,
  apiPost,
  apiPostForm,
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
import type { PaginationMeta } from '@/lib/api/types';
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
  if (payload.currency !== undefined) {
    formData.append('currency', payload.currency);
  }
  if (payload.file) {
    formData.append('file', payload.file);
  }
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
