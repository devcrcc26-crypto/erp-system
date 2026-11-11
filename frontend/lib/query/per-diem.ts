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
  apiPut,
  downloadApiFile,
} from '@/lib/api/client';
import type {
  CreateDisbursementPayload,
  CreateRequestSettlementPayload,
  FormalizeRequestSettlementBalancePayload,
  EmployeePerDiemActiveCategory,
  EmployeePerDiemRate,
  EmployeePerDiemRateListItem,
  ListEmployeePerDiemRatesParams,
  ListPerDiemRequestsParams,
  PerDiemAdvanceSummary,
  PerDiemRequestDetail,
  PerDiemRequestListItem,
  PerDiemSettlementDetail,
  PerDiemSettlementListItem,
  RecordCashReturnedPayload,
  SubmitPerDiemRequestPayload,
  SubmitPerDiemSettlementPayload,
  UpdatePerDiemRequestPayload,
  UpsertEmployeePerDiemRatePayload,
} from '@/lib/api/per-diem.types';
import { invalidateAfterRequestEdit } from '@/lib/query/request-edit';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
  PaginationMeta,
} from '@/lib/api/types';
import { approvalKeys } from '@/lib/query/approvals';
import { toQueryString } from '@/lib/query/pm-query-utils';

type PaginatedResult<T> = { data: T[]; meta: PaginationMeta };

const EMPLOYEE_RATES_PATH = '/hr/employee-per-diem-rates';
const REQUESTS_PATH = '/hr/per-diem';
const SETTLEMENTS_PATH = '/hr/per-diem/settlements';

export const employeePerDiemRateKeys = {
  all: ['employee-per-diem-rate'] as const,
  lists: () => [...employeePerDiemRateKeys.all, 'list'] as const,
  list: (params: ListEmployeePerDiemRatesParams) =>
    [...employeePerDiemRateKeys.lists(), params] as const,
  employee: (employeeId: string) =>
    [...employeePerDiemRateKeys.all, employeeId] as const,
  myActive: () => [...employeePerDiemRateKeys.all, 'me', 'active'] as const,
  employeeActive: (employeeId: string) =>
    [...employeePerDiemRateKeys.all, 'employee', employeeId, 'active'] as const,
  myFull: () => [...employeePerDiemRateKeys.all, 'me', 'full'] as const,
};

export const perDiemKeys = {
  all: ['per-diem'] as const,
  lists: () => [...perDiemKeys.all, 'list'] as const,
  list: (params: ListPerDiemRequestsParams) =>
    [...perDiemKeys.lists(), params] as const,
  details: () => [...perDiemKeys.all, 'detail'] as const,
  detail: (id: string) => [...perDiemKeys.details(), id] as const,
};

export const perDiemSettlementKeys = {
  all: ['per-diem-settlement'] as const,
  lists: () => [...perDiemSettlementKeys.all, 'list'] as const,
  details: () => [...perDiemSettlementKeys.all, 'detail'] as const,
  detail: (id: string) => [...perDiemSettlementKeys.details(), id] as const,
  unsettled: () => [...perDiemSettlementKeys.all, 'unsettled'] as const,
};

/**
 * Active destination categories for an on-behalf target employee, or the
 * current employee when `employeeId` is omitted (submission form).
 */
export function useActiveEmployeePerDiemCategories(
  employeeId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: employeeId
      ? employeePerDiemRateKeys.employeeActive(employeeId)
      : employeePerDiemRateKeys.myActive(),
    queryFn: () =>
      apiGet<EmployeePerDiemActiveCategory[]>(
        employeeId
          ? `${EMPLOYEE_RATES_PATH}/employee/${employeeId}/active`
          : `${EMPLOYEE_RATES_PATH}/me/active`,
      ),
    enabled,
    retry: false,
  });
}

/** Active destination categories for the current employee (submission form). */
export function useMyActiveEmployeePerDiemCategories(enabled = true) {
  return useQuery({
    queryKey: employeePerDiemRateKeys.myActive(),
    queryFn: () =>
      apiGet<EmployeePerDiemActiveCategory[]>(`${EMPLOYEE_RATES_PATH}/me/active`),
    enabled,
    retry: false,
  });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the employee per diem rates list (filter locally).
 */
async function fetchAllEmployeePerDiemRatePages(): Promise<
  EmployeePerDiemRateListItem[]
> {
  const first = await apiGetPaginated<EmployeePerDiemRateListItem>(
    `${EMPLOYEE_RATES_PATH}${toQueryString({
      page: 1,
      limit: FETCH_PAGE_SIZE,
      sortBy: 'lastName',
      sortOrder: 'asc',
    })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<EmployeePerDiemRateListItem>(
        `${EMPLOYEE_RATES_PATH}${toQueryString({
          page: index + 2,
          limit: FETCH_PAGE_SIZE,
          sortBy: 'lastName',
          sortOrder: 'asc',
        })}`,
      ),
    ),
  );

  for (const page of rest) {
    all.push(...page.data);
  }
  return all;
}

/** Paginated employee per diem rates (HR list page). */
export function useEmployeePerDiemRatesList(
  params: ListEmployeePerDiemRatesParams = {
    page: 1,
    limit: 20,
    sortBy: 'lastName',
    sortOrder: 'asc',
  },
  enabled = true,
) {
  return useQuery({
    queryKey: employeePerDiemRateKeys.list(params),
    queryFn: () =>
      apiGetPaginated<EmployeePerDiemRateListItem>(
        `${EMPLOYEE_RATES_PATH}${toQueryString(params)}`,
      ) as Promise<PaginatedResult<EmployeePerDiemRateListItem>>,
    enabled,
    retry: false,
  });
}

/**
 * All employee per diem rate rows for client-side filter/search.
 */
export function useEmployeePerDiemRatesAll(enabled = true) {
  return useQuery({
    queryKey: [...employeePerDiemRateKeys.lists(), 'all'] as const,
    queryFn: () => fetchAllEmployeePerDiemRatePages(),
    enabled,
    retry: false,
  });
}

/** Full per diem rate row for the current employee (self profile). */
export function useMyEmployeePerDiemRate(enabled = true) {
  return useQuery({
    queryKey: employeePerDiemRateKeys.myFull(),
    queryFn: () =>
      apiGet<EmployeePerDiemRate>(`${EMPLOYEE_RATES_PATH}/me`),
    enabled,
    retry: false,
  });
}

/** Full per diem rate row for an employee (HR profile). */
export function useEmployeePerDiemRate(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: employeePerDiemRateKeys.employee(employeeId),
    queryFn: () =>
      apiGet<EmployeePerDiemRate>(
        `${EMPLOYEE_RATES_PATH}/employee/${employeeId}`,
      ),
    enabled: Boolean(employeeId) && enabled,
    retry: false,
  });
}

export function useUpsertEmployeePerDiemRate(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertEmployeePerDiemRatePayload) =>
      apiPut<EmployeePerDiemRate>(
        `${EMPLOYEE_RATES_PATH}/employee/${employeeId}`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: employeePerDiemRateKeys.employee(employeeId),
      });
      void queryClient.invalidateQueries({
        queryKey: employeePerDiemRateKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeePerDiemRateKeys.myFull(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeePerDiemRateKeys.myActive(),
      });
      queryClient.setQueryData(
        employeePerDiemRateKeys.employee(employeeId),
        updated,
      );
    },
  });
}

function buildListQuery(params: ListPerDiemRequestsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(',')
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

/**
 * Loads every page for the per diem requests list endpoint (filter locally).
 */
async function fetchAllPerDiemRequestPages(): Promise<PerDiemRequestListItem[]> {
  const first = await apiGetPaginated<PerDiemRequestListItem>(
    `${REQUESTS_PATH}${buildListQuery({ page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<PerDiemRequestListItem>(
        `${REQUESTS_PATH}${buildListQuery({
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

/** Paginated per diem requests. */
export function usePerDiemRequests(
  params: ListPerDiemRequestsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: perDiemKeys.list(params),
    queryFn: () =>
      apiGetPaginated<PerDiemRequestListItem>(
        `${REQUESTS_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<PerDiemRequestListItem>>,
    enabled,
    retry: false,
  });
}

/**
 * All per diem requests (all pages) for client-side filter/search.
 */
export function usePerDiemRequestsAll(enabled = true) {
  return useQuery({
    queryKey: [...perDiemKeys.lists(), 'all'] as const,
    queryFn: () => fetchAllPerDiemRequestPages(),
    enabled,
    retry: false,
  });
}

/** Single per diem request with approval tiers. */
export function usePerDiemRequest(id: string, enabled = true) {
  return useQuery({
    queryKey: perDiemKeys.detail(id),
    queryFn: () => apiGet<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Submits a new per diem request. */
export function useSubmitPerDiemRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPerDiemRequestPayload) =>
      apiPost<PerDiemRequestDetail>(REQUESTS_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.setQueryData(perDiemKeys.detail(created.id), created);
    },
  });
}

/** Employee edit of a DRAFT / RETURNED request (RETURNED is resubmitted). */
export function useUpdatePerDiemRequest(id: string) {
  const queryClient = useQueryClient();
  const detailKey = perDiemKeys.detail(id);
  return useMutation({
    mutationFn: (payload: UpdatePerDiemRequestPayload) =>
      apiPatch<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      queryClient.setQueryData(detailKey, updated);
      invalidateAfterRequestEdit(queryClient);
    },
  });
}

/** Cancels a draft/submitted per diem request. */
export function useCancelPerDiemRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(perDiemKeys.detail(id), updated);
    },
  });
}

/** HR records a cash disbursement against an approved/active per diem request. */
export function useAddPerDiemDisbursement(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDisbursementPayload) =>
      apiPost<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}/disbursements`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.setQueryData(perDiemKeys.detail(id), updated);
    },
  });
}

/** HR settles an active per diem request. */
export function useSettlePerDiemRequest(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRequestSettlementPayload) =>
      apiPost<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}/settle`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.lists(),
      });
      void queryClient.setQueryData(perDiemKeys.detail(id), updated);
    },
  });
}

/** HR formalizes settlement balance payment (owed to employee or company). */
export function useFormalizeRequestSettlementBalance(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: FormalizeRequestSettlementBalancePayload) =>
      apiPost<PerDiemRequestDetail>(
        `${REQUESTS_PATH}/${requestId}/settlement/formalize-balance`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.lists(),
      });
      void queryClient.setQueryData(perDiemKeys.detail(requestId), updated);
    },
  });
}

/** Approver sets the approved daily rate before confirming approval. */
export function useSetApprovedPerDiemRate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (approvedDailyRate: number) =>
      apiPatch<PerDiemRequestDetail>(`${REQUESTS_PATH}/${id}/approved-rate`, { approvedDailyRate }),
    onSuccess: (updated) => {
      void queryClient.setQueryData(perDiemKeys.detail(id), updated);
    },
  });
}

/** Upload a receipt attachment for a disbursement. */
export function useUploadDisbursementAttachment(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      disbursementId,
      file,
    }: {
      disbursementId: string;
      file: File;
    }) => {
      const form = new FormData();
      form.append('file', file);
      return apiPostForm<PerDiemRequestDetail>(
        `${REQUESTS_PATH}/${requestId}/disbursements/${disbursementId}/attachments`,
        form,
      );
    },
    onSuccess: (updated) => {
      void queryClient.setQueryData(perDiemKeys.detail(requestId), updated);
    },
  });
}

/**
 * Preview per diem request Excel import without writing.
 */
export function usePerDiemRequestImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${REQUESTS_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit per diem request Excel import (submits on behalf of employees).
 */
export function usePerDiemRequestImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${REQUESTS_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
    },
  });
}

/**
 * Downloads the per diem request import template.
 */
export async function downloadPerDiemRequestImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${REQUESTS_PATH}/import/template`,
    'per-diem-import-template.xlsx',
  );
}

async function fetchAllRequestSettlementPages(): Promise<
  PerDiemSettlementListItem[]
> {
  const first = await apiGetPaginated<PerDiemSettlementListItem>(
    `${REQUESTS_PATH}/request-settlements${buildListQuery({
      page: 1,
      limit: FETCH_PAGE_SIZE,
    })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages ?? 1;
  if (pages <= 1) {
    return all;
  }
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<PerDiemSettlementListItem>(
        `${REQUESTS_PATH}/request-settlements${buildListQuery({
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

async function fetchAllSettlementPages(): Promise<PerDiemSettlementListItem[]> {
  const [batch, requestLevel] = await Promise.all([
    (async () => {
      const first = await apiGetPaginated<PerDiemSettlementListItem>(
        `${SETTLEMENTS_PATH}${buildListQuery({ page: 1, limit: FETCH_PAGE_SIZE })}`,
      );
      const all = [...first.data];
      const pages = first.meta.pages ?? 1;
      if (pages <= 1) {
        return all;
      }
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, index) =>
          apiGetPaginated<PerDiemSettlementListItem>(
            `${SETTLEMENTS_PATH}${buildListQuery({
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
    })(),
    fetchAllRequestSettlementPages(),
  ]);

  return [...batch, ...requestLevel].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Approved unsettled advances belonging to the current user. */
export function useUnsettledPerDiemAdvances(enabled = true) {
  return useQuery({
    queryKey: perDiemSettlementKeys.unsettled(),
    queryFn: () =>
      apiGet<PerDiemAdvanceSummary[]>(`${SETTLEMENTS_PATH}/unsettled-advances`),
    enabled,
    retry: false,
  });
}

/** All per diem settlements for the list tab. */
export function usePerDiemSettlementsAll(enabled = true) {
  return useQuery({
    queryKey: [...perDiemSettlementKeys.lists(), 'all'] as const,
    queryFn: () => fetchAllSettlementPages(),
    enabled,
    retry: false,
  });
}

/** Single per diem settlement with advances and approval tiers. */
export function usePerDiemSettlement(id: string, enabled = true) {
  return useQuery({
    queryKey: perDiemSettlementKeys.detail(id),
    queryFn: () =>
      apiGet<PerDiemSettlementDetail>(`${SETTLEMENTS_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/** Submits a per diem settlement. */
export function useSubmitPerDiemSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitPerDiemSettlementPayload) =>
      apiPost<PerDiemSettlementDetail>(SETTLEMENTS_PATH, payload),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.unsettled(),
      });
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.setQueryData(
        perDiemSettlementKeys.detail(created.id),
        created,
      );
    },
  });
}

/** Cancels a settlement and releases its advances. */
export function useCancelPerDiemSettlement(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<PerDiemSettlementDetail>(`${SETTLEMENTS_PATH}/${id}/cancel`),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.unsettled(),
      });
      void queryClient.invalidateQueries({ queryKey: perDiemKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      void queryClient.setQueryData(perDiemSettlementKeys.detail(id), updated);
    },
  });
}

/** HR records the cash-returned receipt on an approved settlement. */
export function useRecordPerDiemCashReturned(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecordCashReturnedPayload) =>
      apiPatch<PerDiemSettlementDetail>(
        `${SETTLEMENTS_PATH}/${id}/cash-returned`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.setQueryData(perDiemSettlementKeys.detail(id), updated);
      void queryClient.invalidateQueries({
        queryKey: perDiemSettlementKeys.lists(),
      });
    },
  });
}
