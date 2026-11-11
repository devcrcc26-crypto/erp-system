'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveAttendanceMonth,
  cancelFieldMovementLog,
  confirmAttendanceImport,
  correctAttendanceDailyLog,
  createFieldMovementLog,
  removeFieldMovementDraftDay,
  upsertFieldMovementDraftEntries,
  getAttendanceImportHistory,
  getAttendanceMonthlyApproval,
  getAwaitingEnrolment,
  getEmployeeAttendance,
  getEmployeeAttendanceDailyLogs,
  getFieldMovementLog,
  getMyAttendance,
  getMyFlaggedDays,
  listAttendanceRecords,
  listAttendanceScanReviews,
  listFieldMovementLogs,
  markAttendanceMonthReviewed,
  previewAttendanceImport,
  reviewAttendanceScanFlag,
  submitFieldMovementLog,
  unlockAttendanceMonth,
} from '@/lib/api/attendance.api';
import type {
  AttendanceListParams,
  AttendanceRecord,
  ConfirmAttendanceImportDto,
  CorrectDailyLogDto,
  CreateFieldMovementLogDto,
  ListFieldMovementLogsParams,
  RemoveFieldMovementDraftDayDto,
  UpsertFieldMovementDraftEntriesDto,
  ReviewScanFlagDto,
  UnlockAttendanceMonthDto,
} from '@/lib/api/attendance.types';

export const attendanceKeys = {
  all: ['attendance'] as const,
  lists: () => [...attendanceKeys.all, 'list'] as const,
  list: (params: AttendanceListParams) =>
    [...attendanceKeys.lists(), params] as const,
  allForPeriod: (month: number, year: number) =>
    [...attendanceKeys.lists(), 'all', month, year] as const,
  me: (year: number) => [...attendanceKeys.all, 'me', year] as const,
  employeeYear: (employeeId: string, year: number) =>
    [...attendanceKeys.all, 'employee', employeeId, year] as const,
  history: () => [...attendanceKeys.all, 'import-history'] as const,
  awaitingEnrolment: () =>
    [...attendanceKeys.all, 'awaiting-enrolment'] as const,
  monthlyApproval: (month: number, year: number) =>
    [...attendanceKeys.all, 'monthly-approval', month, year] as const,
  employeeDailyLogs: (employeeId: string, month: number, year: number) =>
    [
      ...attendanceKeys.all,
      'daily-logs',
      employeeId,
      month,
      year,
    ] as const,
  flaggedDays: (month: number, year: number) =>
    [...attendanceKeys.all, 'flagged-days', month, year] as const,
  fieldMovementLists: () =>
    [...attendanceKeys.all, 'field-movement'] as const,
  fieldMovementList: (params: ListFieldMovementLogsParams) =>
    [...attendanceKeys.fieldMovementLists(), params] as const,
  fieldMovementDetail: (id: string) =>
    [...attendanceKeys.all, 'field-movement', id] as const,
  scanReviews: (month: number, year: number) =>
    [...attendanceKeys.all, 'scan-reviews', month, year] as const,
};

const FETCH_PAGE_SIZE = 100;

/**
 * Loads every page for a month/year (search/employee filter locally).
 */
async function fetchAllAttendancePages(
  params: Pick<AttendanceListParams, 'month' | 'year'>,
): Promise<AttendanceRecord[]> {
  const first = await listAttendanceRecords({
    ...params,
    page: 1,
    limit: FETCH_PAGE_SIZE,
  });
  const all = [...first.data];
  const pages = Math.max(1, Math.ceil(first.total / FETCH_PAGE_SIZE) || 1);
  if (pages <= 1) {
    return all;
  }

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      listAttendanceRecords({
        ...params,
        page: index + 2,
        limit: FETCH_PAGE_SIZE,
      }),
    ),
  );

  for (const page of rest) {
    all.push(...page.data);
  }
  return all;
}

/**
 * Paginated attendance list for the current filters.
 */
export function useAttendanceRecords(
  params: AttendanceListParams,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.list(params),
    queryFn: () => listAttendanceRecords(params),
    enabled,
    retry: false,
  });
}

/**
 * All attendance records for a month/year (client-side filter/search).
 */
export function useAttendanceRecordsAll(
  params: Pick<AttendanceListParams, 'month' | 'year'>,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.allForPeriod(params.month!, params.year!),
    queryFn: () => fetchAllAttendancePages(params),
    enabled: enabled && params.month != null && params.year != null,
    retry: false,
  });
}

/**
 * Own attendance profile for a calendar year.
 */
export function useMyAttendance(year: number, enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.me(year),
    queryFn: () => getMyAttendance(year),
    enabled,
    retry: false,
    refetchOnMount: 'always',
  });
}

/**
 * HR year profile for one employee.
 */
export function useEmployeeAttendance(
  employeeId: string | undefined,
  year: number,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.employeeYear(employeeId ?? '', year),
    queryFn: () => getEmployeeAttendance(employeeId!, year),
    enabled: Boolean(employeeId) && enabled,
    retry: false,
  });
}

/**
 * Import batch history (HR).
 */
export function useAttendanceImportHistory(enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.history(),
    queryFn: () => getAttendanceImportHistory(),
    enabled,
    retry: false,
  });
}

/**
 * Monthly approval status for a period.
 */
export function useAttendanceMonthlyApproval(
  month: number,
  year: number,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.monthlyApproval(month, year),
    queryFn: () => getAttendanceMonthlyApproval(month, year),
    enabled,
    retry: false,
  });
}

/**
 * Employee daily logs for the HR review drawer.
 */
export function useEmployeeAttendanceDailyLogs(
  employeeId: string | undefined,
  month: number,
  year: number,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.employeeDailyLogs(employeeId ?? '', month, year),
    queryFn: () => getEmployeeAttendanceDailyLogs(employeeId!, month, year),
    enabled: Boolean(employeeId) && enabled,
    retry: false,
  });
}

/**
 * Preview an attendance Excel upload.
 */
export function useAttendanceImportPreview() {
  return useMutation({
    mutationFn: (file: File) => previewAttendanceImport(file),
  });
}

/**
 * Confirm a cached attendance import preview.
 */
/**
 * Open enrolment list (Needs enrolment, no scan in a later import).
 */
export function useAwaitingEnrolment(enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.awaitingEnrolment(),
    queryFn: () => getAwaitingEnrolment(),
    enabled,
    retry: false,
  });
}

export function useAttendanceImportConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ConfirmAttendanceImportDto) =>
      confirmAttendanceImport(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Mark month as reviewed.
 */
export function useMarkAttendanceMonthReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monthlyApprovalId: string) =>
      markAttendanceMonthReviewed(monthlyApprovalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Approve and lock a month.
 */
export function useApproveAttendanceMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monthlyApprovalId: string) =>
      approveAttendanceMonth(monthlyApprovalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Unlock an approved month.
 */
export function useUnlockAttendanceMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      monthlyApprovalId,
      dto,
    }: {
      monthlyApprovalId: string;
      dto: UnlockAttendanceMonthDto;
    }) => unlockAttendanceMonth(monthlyApprovalId, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Correct a daily log clock time.
 */
export function useCorrectAttendanceDailyLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CorrectDailyLogDto) => correctAttendanceDailyLog(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Unresolved flagged days for the signed-in employee.
 */
export function useMyFlaggedDays(
  month: number,
  year: number,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.flaggedDays(month, year),
    queryFn: () => getMyFlaggedDays(month, year),
    enabled: enabled && month >= 1 && month <= 12 && year >= 2020,
    retry: false,
    refetchOnMount: 'always',
  });
}

/**
 * Paginated field movement logs.
 */
export function useFieldMovementLogs(
  params: ListFieldMovementLogsParams,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.fieldMovementList(params),
    queryFn: () => listFieldMovementLogs(params),
    enabled,
    retry: false,
  });
}

const FIELD_MOVEMENT_FETCH_PAGE_SIZE = 100;

/**
 * All field movement logs for current filters (client-side stats/paging).
 */
export function useFieldMovementLogsAll(
  params: Omit<ListFieldMovementLogsParams, 'page' | 'limit'>,
  enabled = true,
) {
  return useQuery({
    queryKey: [...attendanceKeys.fieldMovementLists(), 'all', params] as const,
    queryFn: async () => {
      const first = await listFieldMovementLogs({
        ...params,
        page: 1,
        limit: FIELD_MOVEMENT_FETCH_PAGE_SIZE,
      });
      const all = [...first.data];
      const pages = Math.max(1, Math.ceil(first.total / FIELD_MOVEMENT_FETCH_PAGE_SIZE) || 1);
      if (pages <= 1) {
        return all;
      }
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, index) =>
          listFieldMovementLogs({
            ...params,
            page: index + 2,
            limit: FIELD_MOVEMENT_FETCH_PAGE_SIZE,
          }),
        ),
      );
      for (const page of rest) {
        all.push(...page.data);
      }
      return all;
    },
    enabled,
    retry: false,
  });
}

/**
 * Single field movement log detail.
 */
export function useFieldMovementLog(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.fieldMovementDetail(id ?? ''),
    queryFn: () => getFieldMovementLog(id!),
    enabled: Boolean(id) && enabled,
    retry: false,
  });
}

/**
 * Upsert draft entries for flagged days in a month.
 */
export function useUpsertFieldMovementDraftEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertFieldMovementDraftEntriesDto) =>
      upsertFieldMovementDraftEntries(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Remove one day from the monthly field movement draft.
 */
export function useRemoveFieldMovementDraftDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RemoveFieldMovementDraftDayDto) =>
      removeFieldMovementDraftDay(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.all });
    },
  });
}

/**
 * Create draft then optionally submit via separate mutation.
 */
export function useCreateFieldMovementLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFieldMovementLogDto) => createFieldMovementLog(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.fieldMovementLists(),
      });
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.all,
      });
    },
  });
}

/**
 * Submit a field movement log for approval.
 */
export function useSubmitFieldMovementLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { id: string; lateReason?: string }) => {
      if (typeof input === 'string') {
        return submitFieldMovementLog(input);
      }
      return submitFieldMovementLog(input.id, {
        lateReason: input.lateReason,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.fieldMovementLists(),
      });
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.all,
      });
    },
  });
}

/**
 * Cancel a field movement log.
 */
export function useCancelFieldMovementLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelFieldMovementLog(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.fieldMovementLists(),
      });
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.fieldMovementDetail(id),
      });
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.all,
      });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/**
 * SCAN_ONLY schedules: SCAN_AFTER_DEADLINE flags for a month (HR review).
 */
export function useAttendanceScanReviews(
  month: number,
  year: number,
  enabled = true,
) {
  return useQuery({
    queryKey: attendanceKeys.scanReviews(month, year),
    queryFn: () => listAttendanceScanReviews({ month, year }),
    enabled,
  });
}

/**
 * Excuse / mark late a SCAN_AFTER_DEADLINE flag.
 */
export function useReviewAttendanceScanFlag(month: number, year: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dailyLogId,
      dto,
    }: {
      dailyLogId: string;
      dto: ReviewScanFlagDto;
    }) => reviewAttendanceScanFlag(dailyLogId, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: attendanceKeys.scanReviews(month, year),
      });
    },
  });
}
