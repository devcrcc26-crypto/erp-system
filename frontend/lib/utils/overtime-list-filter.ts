import type {
  OvertimeSheetListItem,
  OvertimeSheetStatus,
} from '@/lib/api/overtime.types';
import { formatOvertimeEmployeeName } from '@/lib/utils/overtime-display';

export type OvertimeStatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: OvertimeSheetStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: OvertimeSheetStatus[] = ['APPROVED'];
const REJECTED_STATUSES: OvertimeSheetStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForOvertimeMode(
  mode: OvertimeStatusMode,
): OvertimeSheetStatus[] {
  switch (mode) {
    case 'pending':
      return PENDING_STATUSES;
    case 'approved':
      return APPROVED_STATUSES;
    case 'rejected':
      return REJECTED_STATUSES;
    default:
      return [];
  }
}

/**
 * Client-side overtime sheet search by sheet #, employee name, or ids.
 */
export function matchesOvertimeSheetSearch(
  row: OvertimeSheetListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatOvertimeEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const chineseName = (row.employee?.chineseName ?? '').toLowerCase();
  const haystack = [
    row.sheetNumber,
    row.id,
    row.employeeId,
    employeeName,
    email,
    chineseName,
    String(row.month),
    String(row.year),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface OvertimeSheetListFilters {
  search: string;
  statusMode?: OvertimeStatusMode;
  employeeId?: string;
  month?: number;
  year?: number;
}

/**
 * Filters overtime sheets in memory (status mode, employee, period, search).
 */
export function filterOvertimeSheets(
  rows: OvertimeSheetListItem[],
  filters: OvertimeSheetListFilters,
): OvertimeSheetListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForOvertimeMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.month != null && row.month !== filters.month) {
      return false;
    }

    if (filters.year != null && row.year !== filters.year) {
      return false;
    }

    return matchesOvertimeSheetSearch(row, filters.search);
  });
}
