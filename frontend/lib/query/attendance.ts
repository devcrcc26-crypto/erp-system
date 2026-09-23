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
  ConfirmAttendanceImportDto,
} from '@/lib/api/attendance.types';

export const attendanceKeys = {
  all: ['attendance'] as const,
  lists: () => [...attendanceKeys.all, 'list'] as const,
  list: (params: AttendanceListParams) =>
    [...attendanceKeys.lists(), params] as const,
  me: (year: number) => [...attendanceKeys.all, 'me', year] as const,
  employeeYear: (employeeId: string, year: number) =>
    [...attendanceKeys.all, 'employee', employeeId, year] as const,
  history: () => [...attendanceKeys.all, 'import-history'] as const,
};

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
