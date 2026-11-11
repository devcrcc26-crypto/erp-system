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
  apiPost,
  apiPostForm,
  downloadApiFile,
} from '@/lib/api/client';
import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
import type {
  ListOvertimeSheetsParams,
  OvertimeSheetDetail,
  OvertimeSheetListItem,
  PreviewOvertimeEntryPayload,
  PreviewOvertimeEntryResult,
  SelectableOvertimeWindowsParams,
  SelectableOvertimeWindowsResult,
  UpsertOvertimeEntryPayload,
} from '@/lib/api/overtime.types';
import type {
  HrImportCommitResult,
  HrImportPreviewResult,
} from '@/lib/api/types';
import { toQueryString } from '@/lib/query/pm-query-utils';

const OVERTIME_PATH = '/hr/overtime';
/** Avoid importing approvals.ts (circular) — matches approvalKeys.all. */
const APPROVALS_QUERY_ROOT = ['approvals'] as const;

export const overtimeKeys = {
  all: ['overtime'] as const,
  lists: () => [...overtimeKeys.all, 'list'] as const,
  list: (params: ListOvertimeSheetsParams) =>
    [...overtimeKeys.lists(), params] as const,
  details: () => [...overtimeKeys.all, 'detail'] as const,
  detail: (id: string) => [...overtimeKeys.details(), id] as const,
  current: () => [...overtimeKeys.all, 'current'] as const,
};

function buildListQuery(params: ListOvertimeSheetsParams): string {
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

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for the overtime list endpoint (filter locally).
 */
async function fetchAllOvertimeSheetPages(
  params: Omit<ListOvertimeSheetsParams, 'page' | 'limit' | 'search'> = {},
): Promise<OvertimeSheetListItem[]> {
  const first = await apiGetPaginated<OvertimeSheetListItem>(
    `${OVERTIME_PATH}${buildListQuery({ ...params, page: 1, limit: FETCH_PAGE_SIZE })}`,
  );
  const all = [...first.data];
  const pages = first.meta.pages;
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      apiGetPaginated<OvertimeSheetListItem>(
        `${OVERTIME_PATH}${buildListQuery({
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
 * All overtime sheets (all pages) for client-side filter/search.
 */
export function useOvertimeSheetsAll(
  params: Omit<ListOvertimeSheetsParams, 'page' | 'limit' | 'search'> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [...overtimeKeys.lists(), 'all', params] as const,
    queryFn: () => fetchAllOvertimeSheetPages(params),
    enabled,
    retry: false,
  });
}

/**
 * Paginated overtime sheets (company-wide for HR; own records otherwise).
 */
export function useOvertimeSheets(
  params: ListOvertimeSheetsParams = { page: 1, limit: 20 },
  enabled = true,
) {
  return useQuery({
    queryKey: overtimeKeys.list(params),
    queryFn: () =>
      apiGetPaginated<OvertimeSheetListItem>(
        `${OVERTIME_PATH}${buildListQuery(params)}`,
      ),
    enabled,
    retry: false,
  });
}

/**
 * Current month sheet (get or create).
 */
export function useCurrentOvertimeSheet(enabled = true) {
  return useQuery({
    queryKey: overtimeKeys.current(),
    queryFn: () => apiGet<OvertimeSheetDetail>(`${OVERTIME_PATH}/current`),
    enabled,
    retry: false,
  });
}

/**
 * Opens or creates a month sheet for the caller or, on behalf, for an eligible employee.
 */
export function useOpenOvertimeSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OnBehalfPayload & { month: number; year: number }) =>
      apiPost<OvertimeSheetDetail>(`${OVERTIME_PATH}/sheets`, payload),
    onSuccess: (sheet) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheet.id), sheet);
    },
  });
}

/**
 * Single overtime sheet with entries and approval tiers.
 */
export function useOvertimeSheet(id: string, enabled = true) {
  return useQuery({
    queryKey: overtimeKeys.detail(id),
    queryFn: () => apiGet<OvertimeSheetDetail>(`${OVERTIME_PATH}/${id}`),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

function invalidateSheetLists(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  void queryClient.invalidateQueries({ queryKey: overtimeKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: overtimeKeys.current() });
}

/**
 * Adds an entry to a sheet.
 */
export function useAddOvertimeEntry(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertOvertimeEntryPayload) =>
      apiPost<OvertimeSheetDetail>(
        `${OVERTIME_PATH}/${sheetId}/entries`,
        payload,
      ),
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
      if (updated.restartedApproval) {
        void queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_ROOT });
      }
    },
  });
}

/**
 * Updates an entry on a sheet.
 */
export function useUpdateOvertimeEntry(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      payload,
    }: {
      entryId: string;
      payload: UpsertOvertimeEntryPayload;
    }) =>
      apiPatch<OvertimeSheetDetail>(
        `${OVERTIME_PATH}/${sheetId}/entries/${entryId}`,
        payload,
      ),
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
      if (updated.restartedApproval) {
        void queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_ROOT });
      }
    },
  });
}

/**
 * Deletes an entry from a sheet.
 */
export function useDeleteOvertimeEntry(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiDelete<OvertimeSheetDetail>(
        `${OVERTIME_PATH}/${sheetId}/entries/${entryId}`,
      ),
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
      if (updated.restartedApproval) {
        void queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_ROOT });
      }
    },
  });
}

/**
 * Uploads attachments for an overtime entry.
 */
export function useUploadOvertimeEntryAttachments(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      files,
    }: {
      entryId: string;
      files: File[];
    }) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      return apiPostForm<OvertimeSheetDetail>(
        `${OVERTIME_PATH}/${sheetId}/entries/${entryId}/attachments`,
        formData,
      );
    },
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
    },
  });
}

/**
 * Removes one attachment from an overtime entry.
 */
export function useRemoveOvertimeEntryAttachment(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      documentId,
    }: {
      entryId: string;
      documentId: string;
    }) =>
      apiDelete<OvertimeSheetDetail>(
        `${OVERTIME_PATH}/${sheetId}/entries/${entryId}/attachments/${documentId}`,
      ),
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
    },
  });
}

/**
 * Submits a sheet for approval.
 */
export function useSubmitOvertimeSheet(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<OvertimeSheetDetail>(`${OVERTIME_PATH}/${sheetId}/submit`),
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
    },
  });
}

/**
 * Soft-deletes an overtime sheet (HR only).
 */
export function useDeleteOvertimeSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sheetId: string) =>
      apiDelete<{ message: string }>(`${OVERTIME_PATH}/${sheetId}`),
    onSuccess: () => {
      invalidateSheetLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: APPROVALS_QUERY_ROOT });
    },
  });
}

/**
 * Cancels a draft/submitted sheet.
 */
export function useCancelOvertimeSheet(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPatch<OvertimeSheetDetail>(`${OVERTIME_PATH}/${sheetId}/cancel`),
    onSuccess: (updated) => {
      invalidateSheetLists(queryClient);
      void queryClient.setQueryData(overtimeKeys.detail(sheetId), updated);
    },
  });
}

/**
 * Loads sheet details in batches (for list entry export).
 */
export async function fetchOvertimeSheetDetails(
  sheetIds: string[],
): Promise<OvertimeSheetDetail[]> {
  const results: OvertimeSheetDetail[] = [];
  const batchSize = 8;
  for (let index = 0; index < sheetIds.length; index += batchSize) {
    const batch = sheetIds.slice(index, index + batchSize);
    const pages = await Promise.all(
      batch.map((id) => apiGet<OvertimeSheetDetail>(`${OVERTIME_PATH}/${id}`)),
    );
    results.push(...pages);
  }
  return results;
}

/**
 * Live overtime hour preview from the work-schedule engine.
 */
export function usePreviewOvertimeEntry() {
  return useMutation({
    mutationFn: (payload: PreviewOvertimeEntryPayload) =>
      apiPost<PreviewOvertimeEntryResult>(
        `${OVERTIME_PATH}/preview-entry`,
        payload,
      ),
  });
}

/**
 * Selectable same-day overtime windows for the entry time pickers.
 */
export function useSelectableOvertimeWindows() {
  return useMutation({
    mutationFn: (params: SelectableOvertimeWindowsParams) => {
      const search = new URLSearchParams({
        employeeId: params.employeeId,
        date: params.date,
      });
      if (params.sheetId) {
        search.set('sheetId', params.sheetId);
      }
      if (params.excludeEntryId) {
        search.set('excludeEntryId', params.excludeEntryId);
      }
      if (params.excludeEntryIds && params.excludeEntryIds.length > 0) {
        search.set('excludeEntryIds', params.excludeEntryIds.join(','));
      }
      return apiGet<SelectableOvertimeWindowsResult>(
        `${OVERTIME_PATH}/selectable-windows?${search.toString()}`,
      );
    },
  });
}

/**
 * Preview company-wide overtime entries Excel import.
 */
export function useOvertimeImportPreview() {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${OVERTIME_PATH}/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit company-wide overtime entries Excel import.
 */
export function useOvertimeImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${OVERTIME_PATH}/import`,
        formData,
      );
    },
    onSuccess: () => {
      invalidateSheetLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: overtimeKeys.details() });
    },
  });
}

/**
 * Downloads the company-wide overtime entries import template.
 */
export async function downloadOvertimeImportTemplate(): Promise<void> {
  await downloadApiFile(
    `${OVERTIME_PATH}/import/template`,
    'overtime-entries-import-template.xlsx',
  );
}

/**
 * Preview sheet-scoped overtime entries Excel import.
 */
export function useOvertimeSheetImportPreview(sheetId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportPreviewResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportPreviewResult>(
        `${OVERTIME_PATH}/${sheetId}/entries/import/preview`,
        formData,
      );
    },
  });
}

/**
 * Commit sheet-scoped overtime entries Excel import.
 */
export function useOvertimeSheetImport(sheetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<HrImportCommitResult> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiPostForm<HrImportCommitResult>(
        `${OVERTIME_PATH}/${sheetId}/entries/import`,
        formData,
      );
    },
    onSuccess: () => {
      invalidateSheetLists(queryClient);
      void queryClient.invalidateQueries({
        queryKey: overtimeKeys.detail(sheetId),
      });
    },
  });
}

/**
 * Downloads the sheet-scoped overtime entries import template.
 */
export async function downloadOvertimeSheetImportTemplate(
  sheetId: string,
): Promise<void> {
  await downloadApiFile(
    `${OVERTIME_PATH}/${sheetId}/entries/import/template`,
    'overtime-sheet-entries-import-template.xlsx',
  );
}
