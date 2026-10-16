'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  apiPostForm,
} from '@/lib/api/client';
import type {
  AddConditionPayload,
  ApprovalCategorySummary,
  ApprovalRequestDetail,
  ApprovalRequestListItem,
  ListApprovalRequestsParams,
  SubmitApprovalRequestPayload,
  TierActionPayload,
} from '@/lib/api/approvals.types';
import type { PaginationMeta } from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';
import { attendanceKeys } from '@/lib/query/attendance';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const APPROVAL_REQUESTS_PATH = '/approval-requests';
const APPROVAL_CATEGORIES_PATH = '/approval-categories';

export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (params: ListApprovalRequestsParams) =>
    [...approvalKeys.lists(), params] as const,
  details: () => [...approvalKeys.all, 'detail'] as const,
  detail: (id: string) => [...approvalKeys.details(), id] as const,
  categories: () => [...approvalKeys.all, 'categories'] as const,
  pendingActionCount: (userId: string) =>
    [...approvalKeys.all, 'pending-action-count', userId] as const,
};

function buildListQuery(params: ListApprovalRequestsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({
    ...rest,
    status: statusValue,
  });
}

/**
 * Paginated approval requests with optional filters.
 */
export function useApprovalRequests(
  params: ListApprovalRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: approvalKeys.list(params),
    queryFn: () =>
      apiGetPaginated<ApprovalRequestListItem>(
        `${APPROVAL_REQUESTS_PATH}${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for an approvals inbox (filter/search locally).
 */
async function fetchAllApprovalRequestPages(
  params: Omit<ListApprovalRequestsParams, 'page' | 'limit' | 'search' | 'status' | 'categoryId' | 'dateFrom' | 'dateTo'> = {},
): Promise<ApprovalRequestListItem[]> {
  const first = await apiGetPaginated<ApprovalRequestListItem>(
    `${APPROVAL_REQUESTS_PATH}${buildListQuery({
      ...params,
      page: 1,
      limit: FETCH_PAGE_SIZE,
    })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<ApprovalRequestListItem>(
        `${APPROVAL_REQUESTS_PATH}${buildListQuery({
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

/** All approval requests for an inbox (all pages) for client-side filter/search. */
export function useApprovalRequestsAll(
  params: Omit<
    ListApprovalRequestsParams,
    'page' | 'limit' | 'search' | 'status' | 'categoryId' | 'dateFrom' | 'dateTo'
  > = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...approvalKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllApprovalRequestPages(params),
    enabled,
    retry: false,
  });
}

/**
 * Badge total for Pending My Action (approval inbox only).
 */
export function usePendingMyActionCount(userId: string, enabled = true) {
  return useQuery({
    queryKey: approvalKeys.pendingActionCount(userId),
    queryFn: async (): Promise<number> => {
      const approvals = await apiGet<{ total: number }>(
        `${APPROVAL_REQUESTS_PATH}/count?inbox=PENDING_MY_ACTION`,
      );
      return approvals.total ?? 0;
    },
    enabled: Boolean(userId) && enabled,
    refetchInterval: 30_000,
    retry: false,
  });
}

/**
 * Single approval request with tiers and comments.
 */
export function useApprovalRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: approvalKeys.detail(id),
    queryFn: () =>
      apiGet<ApprovalRequestDetail>(`${APPROVAL_REQUESTS_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/**
 * Active approval categories for filter dropdowns.
 */
export function useApprovalCategories(enabled = true) {
  return useQuery({
    queryKey: approvalKeys.categories(),
    queryFn: () =>
      apiGet<ApprovalCategorySummary[]>(APPROVAL_CATEGORIES_PATH),
    enabled,
    retry: false,
  });
}

/**
 * Submits a new approval request.
 */
export function useSubmitApprovalRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitApprovalRequestPayload) =>
      apiPost<ApprovalRequestDetail>(APPROVAL_REQUESTS_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(approvalKeys.detail(created.id), created);
    },
  });
}

function invalidateApprovalQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  requestId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
  void queryClient.invalidateQueries({
    queryKey: approvalKeys.detail(requestId),
  });
  void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
}

export function useApproveApprovalTier(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      payload,
    }: {
      tierId: string;
      payload?: TierActionPayload;
    }) =>
      apiPost<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/tiers/${tierId}/approve`,
        payload ?? {},
      ),
    onSuccess: () => invalidateApprovalQueries(queryClient, requestId),
  });
}

export function useRejectApprovalTier(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      payload,
    }: {
      tierId: string;
      payload?: TierActionPayload;
    }) =>
      apiPost<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/tiers/${tierId}/reject`,
        payload ?? {},
      ),
    onSuccess: () => invalidateApprovalQueries(queryClient, requestId),
  });
}

export function useReturnApprovalTier(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      payload,
    }: {
      tierId: string;
      payload?: TierActionPayload;
    }) =>
      apiPost<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/tiers/${tierId}/return`,
        payload ?? {},
      ),
    onSuccess: () => invalidateApprovalQueries(queryClient, requestId),
  });
}

export function useAddApprovalCondition(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      payload,
    }: {
      tierId: string;
      payload: AddConditionPayload;
    }) =>
      apiPost<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/tiers/${tierId}/conditions`,
        payload,
      ),
    onSuccess: () => invalidateApprovalQueries(queryClient, requestId),
  });
}

export function useResolveApprovalCondition(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      tierId,
      index,
    }: {
      tierId: string;
      index: number;
    }) =>
      apiPatch<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/tiers/${tierId}/conditions/${index}/resolve`,
      ),
    onSuccess: () => invalidateApprovalQueries(queryClient, requestId),
  });
}

/**
 * Requester resubmits a RETURNED approval (multipart note + files).
 */
export function useResubmitApprovalRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ note, files }: { note?: string; files: File[] }) => {
      const formData = new FormData();
      if (note?.trim()) {
        formData.append('note', note.trim());
      }
      for (const file of files) {
        formData.append('files', file);
      }
      return apiPostForm<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/resubmit`,
        formData,
      );
    },
    onSuccess: (updated) => {
      invalidateApprovalQueries(queryClient, requestId);
      void queryClient.setQueryData(approvalKeys.detail(requestId), updated);
    },
  });
}

/**
 * Requester responds to a condition (multipart note + files).
 */
export function useRespondToApprovalCondition(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conditionIndex,
      note,
      files,
    }: {
      conditionIndex: number;
      note?: string;
      files: File[];
    }) => {
      const formData = new FormData();
      if (note?.trim()) {
        formData.append('note', note.trim());
      }
      for (const file of files) {
        formData.append('files', file);
      }
      return apiPostForm<ApprovalRequestDetail>(
        `${APPROVAL_REQUESTS_PATH}/${requestId}/conditions/${conditionIndex}/respond`,
        formData,
      );
    },
    onSuccess: (updated) => {
      invalidateApprovalQueries(queryClient, requestId);
      void queryClient.setQueryData(approvalKeys.detail(requestId), updated);
    },
  });
}

/** HR Manager / System Administrator: move a pending tier to another active user. */
export function useReassignApprovalTier(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { tierId: string; newApproverId: string; reason: string }) =>
      apiPost<{ tierId: string; requestId: string; approverId: string }>(
        `/approvals/tiers/${payload.tierId}/reassign`,
        { newApproverId: payload.newApproverId, reason: payload.reason },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalKeys.detail(requestId) });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
    },
  });
}
