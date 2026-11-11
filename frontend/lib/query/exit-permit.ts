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
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';

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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the exit permit list (filter locally).
 */
async function fetchAllExitPermitPages(
  params: Omit<ListExitPermitsParams, 'page' | 'limit' | 'search'> = {},
): Promise<ExitPermitListItem[]> {
  const first = await apiGetPaginated<ExitPermitListItem>(
    `${EXIT_PERMIT_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<ExitPermitListItem>(
        `${EXIT_PERMIT_PATH}${buildListQuery({
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

/** All exit permits (all pages) for client-side filter/search. */
export function useExitPermitsAll(
  params: Omit<ListExitPermitsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...exitPermitKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllExitPermitPages(params),
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
      invalidateAfterRequestEdit(queryClient);
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
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
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

/**
 * Loads exit permit details in batches, for the list export's items sheet.
 */
export async function fetchExitPermitDetails(
  permitIds: string[],
): Promise<ExitPermitDetail[]> {
  const results: ExitPermitDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < permitIds.length; index += batchSize) {
    const batch = permitIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) => apiGet<ExitPermitDetail>(`${EXIT_PERMIT_PATH}/${id}`)),
    );
    results.push(...pages);
  }
  return results;
}

export function openExitPermitDetailPdf(id: string): Promise<void> {
  return openPdfInNewTab(`${EXIT_PERMIT_PATH}/${id}/pdf`);
}

/** A5 gate pass for an approved permit, printed and stamped at the gate. */
export function openExitPermitGatePassPdf(id: string): Promise<void> {
  return openPdfInNewTab(`${EXIT_PERMIT_PATH}/${id}/gate-pass`);
}

async function openPdfInNewTab(url: string): Promise<void> {
  const response = await apiClient.get(url, { responseType: 'blob' });
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

export async function openExitPermitGateRegisterPdf(
  date: string,
  direction: 'ENTRANCE' | 'EXIT' | 'ALL' = 'ALL',
): Promise<void> {
  const params = new URLSearchParams({ date, direction });
  const response = await apiClient.get(`${EXIT_PERMIT_PATH}/gate-register/pdf?${params}`, { responseType: 'blob' });
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
