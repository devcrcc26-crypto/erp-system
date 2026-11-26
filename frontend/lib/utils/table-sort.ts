import type { LeavePolicy } from '@/lib/api/leave-policy.types';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveBalanceEntry,
  LeaveRequestListItem,
} from '@/lib/api/leave.types';
import { formatLeaveEmployeeName } from '@/lib/utils/leave-display';
import { parentalBalanceFor } from '@/lib/utils/leave-balance-summary';

export type ClientSortOrder = 'asc' | 'desc';

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

export function compareNumber(a: number, b: number): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function compareDate(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = a ? Date.parse(a) : Number.NaN;
  const right = b ? Date.parse(b) : Number.NaN;
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  if (!leftOk && !rightOk) {
    return 0;
  }
  if (!leftOk) {
    return 1;
  }
  if (!rightOk) {
    return -1;
  }
  return compareNumber(left, right);
}

function balanceRemaining(balance: LeaveBalance | null | undefined): number {
  return balance?.remaining ?? Number.NEGATIVE_INFINITY;
}

/**
 * Stable client sort: returns a new array. No-op when sortBy/sortOrder missing.
 */
export function applyClientSort<T>(
  rows: readonly T[],
  sortBy: string | undefined,
  sortOrder: ClientSortOrder | undefined,
  compare: (a: T, b: T, key: string) => number,
): T[] {
  if (!sortBy || !sortOrder) {
    return [...rows];
  }
  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => compare(a, b, sortBy) * direction);
}

export function compareLeaveRequest(
  a: LeaveRequestListItem,
  b: LeaveRequestListItem,
  key: string,
): number {
  switch (key) {
    case 'requestNumber':
      return compareText(a.requestNumber, b.requestNumber);
    case 'employee':
      return compareText(
        formatLeaveEmployeeName(a.employee),
        formatLeaveEmployeeName(b.employee),
      );
    case 'employeeCode':
      return compareText(
        a.employee?.employeeCode?.trim() ?? '',
        b.employee?.employeeCode?.trim() ?? '',
      );
    case 'leaveType':
      return compareText(a.leaveType, b.leaveType);
    case 'startDate':
      return compareDate(a.startDate, b.startDate);
    case 'endDate':
      return compareDate(a.endDate, b.endDate);
    case 'days':
      return compareNumber(Number(a.days ?? 0), Number(b.days ?? 0));
    case 'status':
      return compareText(a.status, b.status);
    case 'createdAt':
      return compareDate(a.createdAt, b.createdAt);
    default:
      return 0;
  }
}

export function sortLeaveRequests(
  rows: readonly LeaveRequestListItem[],
  sortBy: string | undefined,
  sortOrder: ClientSortOrder | undefined,
): LeaveRequestListItem[] {
  return applyClientSort(rows, sortBy, sortOrder, compareLeaveRequest);
}

export function compareLeaveBalanceSummary(
  a: EmployeeLeaveBalanceSummary,
  b: EmployeeLeaveBalanceSummary,
  key: string,
): number {
  switch (key) {
    case 'employee':
      return compareText(
        formatLeaveEmployeeName(a.employee),
        formatLeaveEmployeeName(b.employee),
      );
    case 'employeeCode':
      return compareText(
        a.employee.employeeCode?.trim() ?? '',
        b.employee.employeeCode?.trim() ?? '',
      );
    case 'annual':
      return compareNumber(balanceRemaining(a.annual), balanceRemaining(b.annual));
    case 'parental':
      return compareNumber(
        balanceRemaining(parentalBalanceFor(a)?.balance),
        balanceRemaining(parentalBalanceFor(b)?.balance),
      );
    case 'sick':
      return compareNumber(balanceRemaining(a.sick), balanceRemaining(b.sick));
    default:
      return 0;
  }
}

export function sortLeaveBalances(
  rows: readonly EmployeeLeaveBalanceSummary[],
  sortBy: string | undefined,
  sortOrder: ClientSortOrder | undefined,
): EmployeeLeaveBalanceSummary[] {
  return applyClientSort(rows, sortBy, sortOrder, compareLeaveBalanceSummary);
}

export function compareLeaveBalanceEntry(
  a: LeaveBalanceEntry,
  b: LeaveBalanceEntry,
  key: string,
): number {
  switch (key) {
    case 'createdAt':
      return compareDate(a.createdAt, b.createdAt);
    case 'leaveYear': {
      const yearOf = (row: LeaveBalanceEntry): number => {
        if (row.leaveYearLabel != null) {
          return row.leaveYearLabel;
        }
        const fromStart = Number(String(row.leaveYearStart).slice(0, 4));
        return Number.isFinite(fromStart) ? fromStart : 0;
      };
      return compareNumber(yearOf(a), yearOf(b));
    }
    case 'leaveType':
      return compareText(a.leaveType, b.leaveType);
    case 'kind':
      return compareText(a.kind, b.kind);
    case 'days':
      return compareNumber(Number(a.days ?? 0), Number(b.days ?? 0));
    case 'reason':
      return compareText(a.reason ?? '', b.reason ?? '');
    case 'by':
      return compareText(a.createdBy?.name?.trim() ?? '', b.createdBy?.name?.trim() ?? '');
    default:
      return 0;
  }
}

export function sortLeaveBalanceEntries(
  rows: readonly LeaveBalanceEntry[],
  sortBy: string | undefined,
  sortOrder: ClientSortOrder | undefined,
): LeaveBalanceEntry[] {
  return applyClientSort(rows, sortBy, sortOrder, compareLeaveBalanceEntry);
}

export function compareLeavePolicy(
  a: LeavePolicy,
  b: LeavePolicy,
  key: string,
): number {
  switch (key) {
    case 'name':
      return compareText(a.name, b.name);
    case 'governedBy':
      return compareText(a.governedBy ?? '', b.governedBy ?? '');
    case 'ruleCount':
      return compareNumber(a.ruleCount, b.ruleCount);
    case 'employeeCount':
      return compareNumber(a.employeeCount, b.employeeCount);
    case 'isActive':
      return compareNumber(Number(a.isActive), Number(b.isActive));
    case 'createdAt':
      return compareDate(a.createdAt, b.createdAt);
    default:
      return 0;
  }
}

export function sortLeavePolicies(
  rows: readonly LeavePolicy[],
  sortBy: string | undefined,
  sortOrder: ClientSortOrder | undefined,
): LeavePolicy[] {
  return applyClientSort(rows, sortBy, sortOrder, compareLeavePolicy);
}
