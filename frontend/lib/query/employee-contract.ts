import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  BonusFromNetRequest,
  BonusFromNetResult,
  CreateEmployeeContractPayload,
  EmployeeContractDetail,
  EmployeeContractListItem,
  ListEmployeeContractsParams,
  MyActiveContract,
  RenewalLeavePreview,
  SalaryPreviewRequest,
  SalaryPreviewResult,
  TerminateEmployeeContractPayload,
  UpdateEmployeeContractPayload,
} from "../api/employee-contract.types";
import { toQueryString } from "./pm-query-utils";
import { PaginatedResult } from "../api/types";
import {
  apiGet,
  apiGetPaginated,
  apiPost,
  apiPostForm,
  apiPatch,
  apiDelete,
  downloadApiFile,
} from "../api/client";
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
} from "../api/types";

const CONTRACT_PATH = "/hr/employee-contracts";

export const employeeContractKeys = {
  all: ["employee-contract"] as const,
  lists: () => [...employeeContractKeys.all, "list"] as const,
  list: (params: ListEmployeeContractsParams) =>
    [...employeeContractKeys.lists(), params] as const,
  myLists: () => [...employeeContractKeys.all, "my"] as const,
  myList: (params: ListEmployeeContractsParams) =>
    [...employeeContractKeys.myLists(), params] as const,
  details: () => [...employeeContractKeys.all, "detail"] as const,
  detail: (id: string) => [...employeeContractKeys.details(), id] as const,
  myActive: (contractId?: string) =>
    [...employeeContractKeys.all, "my-active", contractId ?? "active"] as const,
  renewalPreview: (employeeId: string, startDate: string) =>
    [...employeeContractKeys.all, "renewal-preview", employeeId, startDate] as const,
};

function buildListQuery(params: ListEmployeeContractsParams): string {
  const { status, ...rest } = params;
  const statusValue = Array.isArray(status)
    ? status.length > 0
      ? status.join(",")
      : undefined
    : status;
  return toQueryString({ ...rest, status: statusValue });
}

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for an employee contract list endpoint (filter locally).
 */
async function fetchAllEmployeeContractPages(
  path: string,
  params: Omit<ListEmployeeContractsParams, "page" | "limit" | "search"> = {},
): Promise<EmployeeContractListItem[]> {
  const first = await apiGetPaginated<EmployeeContractListItem>(
    `${path}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<EmployeeContractListItem>(
        `${path}${buildListQuery({
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

/**
 * Company-wide employee contracts (all pages) for client-side filter/search.
 */
export function useEmployeeContractsAll(
  params: Omit<ListEmployeeContractsParams, "page" | "limit" | "search"> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...employeeContractKeys.lists(), "all", params] as const,
    queryFn: () => fetchAllEmployeeContractPages(CONTRACT_PATH, params),
    enabled,
    retry: false,
  });
}

/**
 * Current user's employee contracts (all pages) for client-side filter/search.
 */
export function useMyEmployeeContractsAll(
  params: Omit<ListEmployeeContractsParams, "page" | "limit" | "search"> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...employeeContractKeys.myLists(), "all", params] as const,
    queryFn: () =>
      fetchAllEmployeeContractPages(`${CONTRACT_PATH}/my`, params),
    enabled,
    retry: false,
  });
}

export function useEmployeeContracts(
  params: ListEmployeeContractsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: employeeContractKeys.list(params),
    queryFn: () =>
      apiGetPaginated<EmployeeContractListItem>(
        `${CONTRACT_PATH}${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<EmployeeContractListItem>>,
    enabled,
    retry: false,
  });
}

export function useMyEmployeeContracts(
  params: ListEmployeeContractsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: employeeContractKeys.myList(params),
    queryFn: () =>
      apiGetPaginated<EmployeeContractListItem>(
        `${CONTRACT_PATH}/my${buildListQuery(params)}`,
      ) as Promise<PaginatedResult<EmployeeContractListItem>>,
    enabled,
    retry: false,
  });
}

export function useEmployeeContract(id: string, enabled = true) {
  return useQuery({
    queryKey: employeeContractKeys.detail(id),
    queryFn: () =>
      apiGet<EmployeeContractDetail>(
        `${CONTRACT_PATH}/${id}`,
      ) as Promise<EmployeeContractDetail>,
    enabled,
    retry: false,
  });
}

/** The signed-in employee's active contract (no pay data), or null. */
export function useMyActiveContract(
  contractId?: string | null,
  enabled = true,
) {
  const id = contractId?.trim() || undefined;
  return useQuery({
    queryKey: employeeContractKeys.myActive(id),
    queryFn: () => {
      const qs = id
        ? `?contractId=${encodeURIComponent(id)}`
        : '';
      return apiGet<{ contract: MyActiveContract | null }>(
        `${CONTRACT_PATH}/my/active${qs}`,
      );
    },
    enabled,
    retry: false,
  });
}

/**
 * Annual leave carry-forward / entitlement for a new contract starting on
 * `startDate` (YYYY-MM-DD). Read-only.
 */
export function useRenewalLeavePreview(
  employeeId: string | undefined,
  startDate: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: employeeContractKeys.renewalPreview(
      employeeId ?? "",
      startDate ?? "",
    ),
    queryFn: () =>
      apiGet<RenewalLeavePreview>(
        `${CONTRACT_PATH}/renewal-preview${toQueryString({ employeeId, startDate })}`,
      ),
    enabled: enabled && Boolean(employeeId) && Boolean(startDate),
    retry: false,
  });
}

export function useCreateEmployeeContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEmployeeContractPayload) => {
      const formData = new FormData();
      formData.append('employeeId', payload.employeeId);
      formData.append('contractType', payload.contractType);
      formData.append('signedAt', payload.signedAt);
      formData.append('startDate', payload.startDate);
      if (payload.endDate) {
        formData.append('endDate', payload.endDate);
      }
      if (payload.notes) {
        formData.append('notes', payload.notes);
      }
      if (payload.basicSalary != null) {
        formData.append('basicSalary', String(payload.basicSalary));
      }
      if (payload.transportationAllowance != null) {
        formData.append(
          'transportationAllowance',
          String(payload.transportationAllowance),
        );
      }
      if (payload.monthlyBonus != null) {
        formData.append('monthlyBonus', String(payload.monthlyBonus));
      }
      if (payload.monthlyNetBonus != null) {
        formData.append('monthlyNetBonus', String(payload.monthlyNetBonus));
      }
      if (payload.pensionApplicable != null) {
        formData.append('pensionApplicable', String(payload.pensionApplicable));
      }
      if (payload.taxApplicable != null) {
        formData.append('taxApplicable', String(payload.taxApplicable));
      }
      if (payload.probationEndDate) {
        formData.append('probationEndDate', payload.probationEndDate);
      }
      if (payload.governedBy) {
        formData.append('governedBy', payload.governedBy);
      }
      for (const file of payload.files ?? []) {
        formData.append('files', file);
      }
      return apiPostForm<EmployeeContractDetail>(CONTRACT_PATH, formData);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.setQueryData(
        employeeContractKeys.detail(created.id),
        created,
      );
    },
  });
}

export function useAttachEmployeeContractFiles(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      return apiPostForm<EmployeeContractDetail>(
        `${CONTRACT_PATH}/${id}/attachments`,
        formData,
      );
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.setQueryData(employeeContractKeys.detail(id), updated);
    },
  });
}

export function useRemoveEmployeeContractAttachment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      apiDelete<EmployeeContractDetail>(
        `${CONTRACT_PATH}/${id}/attachments/${documentId}`,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.setQueryData(employeeContractKeys.detail(id), updated);
    },
  });
}

export function useUpdateEmployeeContract(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateEmployeeContractPayload) =>
      apiPatch<EmployeeContractDetail>(`${CONTRACT_PATH}/${id}`, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.setQueryData(employeeContractKeys.detail(id), updated);
    },
  });
}

export function useTerminateEmployeeContract(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TerminateEmployeeContractPayload) =>
      apiPatch<EmployeeContractDetail>(
        `${CONTRACT_PATH}/${id}/terminate`,
        payload,
      ),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });

      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.setQueryData(employeeContractKeys.detail(id), updated);
      // Linked employment leaving date may have been synced.
      void queryClient.invalidateQueries({ queryKey: ['users', 'employment'] });
    },
  });
}

export function useDeleteEmployeeContract(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ success: boolean }>(`${CONTRACT_PATH}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.removeQueries({
        queryKey: employeeContractKeys.detail(id),
      });
    },
  });
}

export function useDeleteEmployeeContractRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ success: boolean }>(`${CONTRACT_PATH}/${id}`),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
      void queryClient.removeQueries({
        queryKey: employeeContractKeys.detail(id),
      });
    },
  });
}

/**
 * Preview employee contract Excel import without writing.
 */
export function useEmployeeContractImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append("file", file);
      return apiPostForm<HrImportPreviewResult>(
        `${CONTRACT_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit employee contract Excel import.
 */
export function useEmployeeContractImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append("file", file);
      return apiPostForm<HrImportCommitResult>(
        `${CONTRACT_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: employeeContractKeys.myLists(),
      });
    },
  });
}

/**
 * Downloads the employee contract import template.
 */
export async function downloadEmployeeContractImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${CONTRACT_PATH}/import/template`,
    "employee-contract-import-template.xlsx",
  );
}

/**
 * Live gross salary preview for the contract form.
 */
export async function previewEmployeeContractSalary(
  payload: SalaryPreviewRequest,
): Promise<SalaryPreviewResult> {
  return apiPost<SalaryPreviewResult>(
    `${CONTRACT_PATH}/salary-preview`,
    payload,
  );
}

/**
 * Solve monthly bonus from a target net pay.
 */
export async function solveBonusFromNet(
  payload: BonusFromNetRequest,
): Promise<BonusFromNetResult> {
  return apiPost<BonusFromNetResult>(
    `${CONTRACT_PATH}/bonus-from-net`,
    payload,
  );
}

/**
 * Mutation wrapper around salary preview (prefer debounced direct call for live UI).
 */
export function useSalaryPreview() {
  return useMutation({
    mutationFn: previewEmployeeContractSalary,
  });
}

/**
 * Mutation wrapper around bonus-from-net solve.
 */
export function useBonusFromNet() {
  return useMutation({
    mutationFn: solveBonusFromNet,
  });
}