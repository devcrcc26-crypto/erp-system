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
  AddExitPermitItemPayload,
  CreateExitPermitPayload,
  ExitPermitDetail,
  ExitPermitListItem,
  ListExitPermitsParams,
  UpdateExitPermitItemPayload,
  UpdateExitPermitPayload,
} from '@/lib/api/exit-permit.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const EXIT_PERMIT_PATH = '/hr/exit-permits';

export const exitPermitKeys = {
  all: ['exit-permit'] as const,
  lists: () => [...exitPermitKeys.all, 'list'] as const,
  list: (params: ListExitPermitsParams) =>
    [...exitPermitKeys.lists(), params] as const,
  details: () => [...exitPermitKeys.all, 'detail'] as const,
  detail: (id: string) => [...exitPermitKeys.details(), id] as const,
};

function buildListQuery(params: ListExitPermitsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

export function buildExitPermitItemFormData(
  payload: AddExitPermitItemPayload | UpdateExitPermitItemPayload,
): FormData {
  const formData = new FormData();
  if (payload.itemName !== undefined) {
    formData.append('itemName', payload.itemName);
  }
  if (payload.issue !== undefined) {
    formData.append('issue', payload.issue);
  }
  if (payload.quantity !== undefined) {
    formData.append('quantity', String(payload.quantity));
  }
  if (payload.unit !== undefined) {
    formData.append('unit', payload.unit);
  }
  if (payload.documentId !== undefined) {
    formData.append('documentId', payload.documentId);
  }
  if (payload.file) {
    formData.append('file', payload.file);
  }
  return formData;
}

/** Paginated exit permits. */
export function useExitPermits(
  params: ListExitPermitsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: exitPermitKeys.list(params),
    queryFn: () =>
      apiGetPaginated<ExitPermitListItem>(
        `${EXIT_PERMIT_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<ExitPermitListItem>>,
    enabled,
    retry: false,
  });
}

/** Single exit permit with items and approval tiers. */
export function useExitPermit(id: string, enabled = true) {
  return useQuery({
    queryKey: exitPermitKeys.detail(id),
    queryFn: () =>
      apiGet<ExitPermitDetail>(`${EXIT_PERMIT_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Creates a new draft exit permit. */
export function useCreateExitPermit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExitPermitPayload) =>
      apiPost<ExitPermitDetail>(EXIT_PERMIT_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: exitPermitKeys.lists(),
      });
      void queryClient.setQueryData(
        exitPermitKeys.detail(created.id),
        created,
      );
    },
  });
}

/** Updates a draft or returned exit permit. */
export function useUpdateExitPermit(permitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateExitPermitPayload) =>
      apiPatch<ExitPermitDetail>(
        `${EXIT_PERMIT_PATH}/${permitId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: exitPermitKeys.lists(),
      });
      void queryClient.setQueryData(
        exitPermitKeys.detail(permitId),
        updated,
      );
    },
  });
}

/** Adds a line item (with optional image) to a draft exit permit. */
export function useAddExitPermitItem(permitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddExitPermitItemPayload) =>
      apiPostForm<ExitPermitDetail>(
        `${EXIT_PERMIT_PATH}/${permitId}/items`,
        buildExitPermitItemFormData(payload),
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        exitPermitKeys.detail(permitId),
        updated,
      );
    },
  });
}

/** Updates a line item and/or replaces its image. */
export function useUpdateExitPermitItem(permitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: UpdateExitPermitItemPayload;
    }) =>
      apiPatchForm<ExitPermitDetail>(
        `${EXIT_PERMIT_PATH}/${permitId}/items/${itemId}`,
        buildExitPermitItemFormData(payload),
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        exitPermitKeys.detail(permitId),
        updated,
      );
    },
  });
}

/** Removes a line item from a draft exit permit. */
export function useDeleteExitPermitItem(permitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiDelete<ExitPermitDetail>(
        `${EXIT_PERMIT_PATH}/${permitId}/items/${itemId}`,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        exitPermitKeys.detail(permitId),
        updated,
      );
    },
  });
}

/** Submits a draft exit permit for approval (multipart with optional files). */
export function useSubmitExitPermit(permitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return apiPostForm<ExitPermitDetail>(
        `${EXIT_PERMIT_PATH}/${permitId}/submit`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: exitPermitKeys.lists(),
      });
      void queryClient.setQueryData(
        exitPermitKeys.detail(permitId),
        updated,
      );
    },
  });
}

/** Cancels a draft or submitted exit permit. */
export function useCancelExitPermit(permitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<ExitPermitDetail>(`${EXIT_PERMIT_PATH}/${permitId}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: exitPermitKeys.lists(),
      });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(
        exitPermitKeys.detail(permitId),
        updated,
      );
    },
  });
}
