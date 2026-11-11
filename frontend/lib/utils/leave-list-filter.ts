import type {
  EmployeeLeaveBalanceSummary,
  LeaveRequestListItem,
  LeaveRequestStatus,
  LeaveType,
} from '@/lib/api/leave.types';
import { formatLeaveEmployeeName } from '@/lib/utils/leave-display';

/**
 * Client-side leave request search by employee name, request #, or ids.
 */
export function matchesLeaveRequestSearch(
  row: LeaveRequestListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatLeaveEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const chineseName = (row.employee?.chineseName ?? '').toLowerCase();
  const haystack = [
    row.requestNumber,
    row.id,
    row.employeeId,
    employeeName,
    email,
    chineseName,
    row.reason ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export type StatusMode = 'all' | 'draft' | 'pending' | 'approved' | 'rejected';

export const DRAFT_STATUSES: LeaveRequestStatus[] = ['DRAFT'];
const PENDING_STATUSES: LeaveRequestStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: LeaveRequestStatus[] = ['APPROVED'];
const REJECTED_STATUSES: LeaveRequestStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForMode(
  mode: StatusMode,
): LeaveRequestStatus[] {
  switch (mode) {
    case 'draft':
      return DRAFT_STATUSES;
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

export interface LeaveRequestListFilters {
  search: string;
  statuses?: LeaveRequestStatus[];
  leaveType?: LeaveType;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters leave requests in memory (status, type, employee, dates, search).
 */
export function filterLeaveRequests(
  rows: LeaveRequestListItem[],
  filters: LeaveRequestListFilters,
): LeaveRequestListItem[] {
  return rows.filter((row) => {
    if (filters.statuses && filters.statuses.length > 0) {
      if (!filters.statuses.includes(row.status)) {
        return false;
      }
    }
    if (filters.leaveType && row.leaveType !== filters.leaveType) {
      return false;
    }
    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }
    if (filters.dateFrom && row.startDate < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && row.startDate > filters.dateTo) {
      return false;
    }
    return matchesLeaveRequestSearch(row, filters.search);
  });
}

/**
 * Client-side leave balance search by employee name, email, or employee id.
 */
export function matchesLeaveBalanceSearch(
  row: EmployeeLeaveBalanceSummary,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatLeaveEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const chineseName = (row.employee?.chineseName ?? '').toLowerCase();
  const haystack = [
    row.employeeId,
    row.employee.id,
    employeeName,
    email,
    chineseName,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface LeaveBalanceListFilters {
  search: string;
  employeeId?: string;
}

/**
 * Filters leave balance rows in memory.
 */
export function filterLeaveBalances(
  rows: EmployeeLeaveBalanceSummary[],
  filters: LeaveBalanceListFilters,
): EmployeeLeaveBalanceSummary[] {
  return rows.filter((row) => {
    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }
    return matchesLeaveBalanceSearch(row, filters.search);
  });
}
