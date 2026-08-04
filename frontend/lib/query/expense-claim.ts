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
  AddExpenseClaimItemPayload,
  CreateExpenseClaimPayload,
  ExpenseClaimDetail,
  ExpenseClaimListItem,
  ListExpenseClaimsParams,
  UpdateExpenseClaimItemPayload,
} from '@/lib/api/expense-claim.types';
import type { PaginationMeta } from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

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
  if (payload.file) formData.append('file', payload.file);
  return formData;
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
