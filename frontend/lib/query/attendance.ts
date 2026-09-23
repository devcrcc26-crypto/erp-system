'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmAttendanceImport,
  getAttendanceImportHistory,
  getEmployeeAttendance,
  getMyAttendance,
  listAttendanceRecords,
  previewAttendanceImport,
} from '@/lib/api/attendance.api';
import type {
  AttendanceListParams,
  AttendanceRecord,
  ConfirmAttendanceImportDto,
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
