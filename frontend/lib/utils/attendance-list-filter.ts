import type { AttendanceRecord } from '@/lib/api/attendance.types';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Client-side attendance search by employee name, ERP id, or department.
 */
export function matchesAttendanceSearch(
  row: AttendanceRecord,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    formatUserName(row.employee),
    row.employee.firstName,
    row.employee.lastName,
    row.employee.employeeId ?? '',
    row.employee.department?.name ?? '',
    row.employeeId,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface AttendanceListFilters {
  search: string;
  employeeId?: string;
}

/**
 * Filters attendance records in memory (search + employee).
 */
export function filterAttendanceRecords(
  rows: AttendanceRecord[],
  filters: AttendanceListFilters,
): AttendanceRecord[] {
  return rows.filter((row) => {
    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }
    return matchesAttendanceSearch(row, filters.search);
  });
}
