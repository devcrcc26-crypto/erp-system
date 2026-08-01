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
} from '@/lib/api/client';
import type {
  ListOvertimeSheetsParams,
  OvertimeSheetDetail,
  OvertimeSheetListItem,
  UpsertOvertimeEntryPayload,
} from '@/lib/api/overtime.types';
import { toQueryString } from '@/lib/query/pm-query-utils';

const OVERTIME_PATH = '/hr/overtime';

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
