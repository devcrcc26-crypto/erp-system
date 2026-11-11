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
  downloadApiFile,
} from '@/lib/api/client';
import type {
  AddExpenseClaimItemPayload,
  CreateExpenseClaimPayload,
  ExpenseClaimDetail,
  ExpenseClaimListItem,
  ListExpenseClaimsParams,
  MarkExpenseClaimPaidPayload,
  UpdateExpenseClaimPayload,
  UpdateExpenseClaimItemPayload,
} from '@/lib/api/expense-claim.types';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const EXPENSE_CLAIM_PATH = '/hr/expense-claims';

export const expenseClaimKeys = {
  all: ['expense-claim'] as const,
  lists: () => [...expenseClaimKeys.all, 'list'] as const,
  list: (params: ListExpenseClaimsParams) =>
    [...expenseClaimKeys.lists(), params] as const,
  details: () => [...expenseClaimKeys.all, 'detail'] as const,
  detail: (id: string) => [...expenseClaimKeys.details(), id] as const,
};

function buildListQuery(params: ListExpenseClaimsParams): string {
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
 * Loads every page for the expense claims list endpoint (filter locally).
 */
async function fetchAllExpenseClaimPages(
  params: Omit<ListExpenseClaimsParams, 'page' | 'limit' | 'search'> = {},
): Promise<ExpenseClaimListItem[]> {
  const first = await apiGetPaginated<ExpenseClaimListItem>(
    `${EXPENSE_CLAIM_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<ExpenseClaimListItem>(
        `${EXPENSE_CLAIM_PATH}${buildListQuery({
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

/** All expense claims (all pages) for client-side filter/search. */
export function useExpenseClaimsAll(
  params: Omit<ListExpenseClaimsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...expenseClaimKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllExpenseClaimPages(params),
    enabled,
    retry: false,
  });
}

/** Paginated expense claims. */
export function useExpenseClaims(
  params: ListExpenseClaimsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: expenseClaimKeys.list(params),
    queryFn: () =>
      apiGetPaginated<ExpenseClaimListItem>(
        `${EXPENSE_CLAIM_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<ExpenseClaimListItem>>,
    enabled,
    retry: false,
  });
}

/** Single expense claim with items and approval tiers. */
export function useExpenseClaim(id: string, enabled = true) {
  return useQuery({
    queryKey: expenseClaimKeys.detail(id),
    queryFn: () => apiGet<ExpenseClaimDetail>(`${EXPENSE_CLAIM_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Creates a new draft claim (no items yet). */
export function useCreateExpenseClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpenseClaimPayload) =>
      apiPost<ExpenseClaimDetail>(EXPENSE_CLAIM_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.setQueryData(expenseClaimKeys.detail(created.id), created);
    },
  });
}

function itemFormData(payload: AddExpenseClaimItemPayload | UpdateExpenseClaimItemPayload): FormData {
  const formData = new FormData();
  if (payload.category !== undefined) formData.append('category', payload.category);
  if (payload.description !== undefined) formData.append('description', payload.description);
  if (payload.expenseDate !== undefined) formData.append('expenseDate', payload.expenseDate);
  if (payload.amount !== undefined) formData.append('amount', String(payload.amount));
  if (payload.currency !== undefined) formData.append('currency', payload.currency);
  // Every file goes on this one item (never one item per file).
  for (const file of payload.files ?? []) formData.append('files', file);
  return formData;
}

/**
 * Builds multipart form data for creating or updating an expense claim line item.
 */
export function buildExpenseClaimItemFormData(
  payload: AddExpenseClaimItemPayload | UpdateExpenseClaimItemPayload,
): FormData {
  return itemFormData(payload);
}

/** Adds a line item (with optional receipt) to a draft claim. */
export function useAddExpenseClaimItem(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddExpenseClaimItemPayload) =>
      apiPostForm<ExpenseClaimDetail>(
        `${EXPENSE_CLAIM_PATH}/${claimId}/items`,
        itemFormData(payload),
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
    },
  });
}

/** Updates a line item and/or replaces its receipt. */
export function useUpdateExpenseClaimItem(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: UpdateExpenseClaimItemPayload;
    }) =>
      apiPatchForm<ExpenseClaimDetail>(
        `${EXPENSE_CLAIM_PATH}/${claimId}/items/${itemId}`,
        itemFormData(payload),
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
    },
  });
}

/** Removes a line item from a draft claim. */
export function useDeleteExpenseClaimItem(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiDelete<ExpenseClaimDetail>(
        `${EXPENSE_CLAIM_PATH}/${claimId}/items/${itemId}`,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
    },
  });
}

/** Submits a draft claim for approval. */
export function useSubmitExpenseClaim(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<ExpenseClaimDetail>(`${EXPENSE_CLAIM_PATH}/${claimId}/submit`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
    },
  });
}

/** Updates claim header on a draft or returned claim. */
export function useUpdateExpenseClaim(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateExpenseClaimPayload) =>
      apiPatch<ExpenseClaimDetail>(
        `${EXPENSE_CLAIM_PATH}/${claimId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
      invalidateAfterRequestEdit(queryClient);
    },
  });
}

/** Soft-deletes an expense claim (HR only). */
export function useDeleteExpenseClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (claimId: string) =>
      apiDelete<{ message: string }>(`${EXPENSE_CLAIM_PATH}/${claimId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
    },
  });
}

/** Marks an approved claim as paid (HR / finance). */
export function useMarkExpenseClaimPaid(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MarkExpenseClaimPaidPayload) =>
      apiPost<ExpenseClaimDetail>(
        `${EXPENSE_CLAIM_PATH}/${claimId}/mark-paid`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
    },
  });
}

/** Cancels a draft/submitted claim. */
export function useCancelExpenseClaim(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<ExpenseClaimDetail>(`${EXPENSE_CLAIM_PATH}/${claimId}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(expenseClaimKeys.detail(claimId), updated);
    },
  });
}

/**
 * Loads claim details in batches (for list item export).
 */
export async function fetchExpenseClaimDetails(
  claimIds: string[],
): Promise<ExpenseClaimDetail[]> {
  const results: ExpenseClaimDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < claimIds.length; index += batchSize) {
    const batch = claimIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) =>
        apiGet<ExpenseClaimDetail>(`${EXPENSE_CLAIM_PATH}/${id}`),
      ),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Preview company-wide expense claim Excel import.
 */
export function useExpenseClaimImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${EXPENSE_CLAIM_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide expense claim Excel import.
 */
export function useExpenseClaimImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${EXPENSE_CLAIM_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: expenseClaimKeys.details(),
      });
    },
  });
}

/**
 * Downloads the company-wide expense claim import template.
 */
export async function downloadExpenseClaimImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${EXPENSE_CLAIM_PATH}/import/template`,
    'expense-claim-import-template.xlsx',
  );
}

/**
 * Preview claim-scoped expense item Excel import.
 */
export function useExpenseClaimItemsImportPreview(claimId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${EXPENSE_CLAIM_PATH}/${claimId}/items/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit claim-scoped expense item Excel import.
 */
export function useExpenseClaimItemsImport(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${EXPENSE_CLAIM_PATH}/${claimId}/items/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: expenseClaimKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: expenseClaimKeys.detail(claimId),
      });
    },
  });
}

/**
 * Downloads the claim-scoped expense items import template.
 */
export async function downloadExpenseClaimItemsImportTemplate(
  claimId: string,
): Promise<void> {
  await downloadApiFile(
    `${EXPENSE_CLAIM_PATH}/${claimId}/items/import/template`,
    'expense-claim-items-import-template.xlsx',
  );
}
