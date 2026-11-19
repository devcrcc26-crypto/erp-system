import type {
  EmployeeContractListItem,
  EmployeeContractStatus,
  EmployeeContractType,
} from '@/lib/api/employee-contract.types';
import {
  formatEmployeeContractEmployeeName,
} from '@/lib/utils/employee-contract-display';

export const EMPLOYEE_CONTRACT_EXPIRING_SOON_DAYS = 90;

export type EmployeeContractStatusMode =
  | 'all'
  | 'active'
  | 'expiringSoon'
  | 'ended';

const ENDED_STATUSES: EmployeeContractStatus[] = [
  'TERMINATED',
  'EXPIRED',
  'SUPERSEDED',
];

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDateOnlyUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isEmployeeContractExpiringSoon(
  row: EmployeeContractListItem,
  referenceDate: Date = new Date(),
): boolean {
  if (row.status !== 'ACTIVE' || !row.endDate) {
    return false;
  }

  const cutoff = addDaysUtc(referenceDate, EMPLOYEE_CONTRACT_EXPIRING_SOON_DAYS);
  const endDate = parseDateOnlyUtc(row.endDate);
  return endDate <= cutoff;
}

/**
 * Calendar-month end-date windows for the contract list, relative to today:
 * last / this / next / second-next calendar month (inclusive of the whole month).
 */
export type EmployeeContractEndWindow =
  | 'lastMonth'
  | 'thisMonth'
  | 'nextMonth'
  | 'secondNextMonth';

export const EMPLOYEE_CONTRACT_END_WINDOWS: readonly EmployeeContractEndWindow[] = [
  'lastMonth',
  'thisMonth',
  'nextMonth',
  'secondNextMonth',
];

const END_WINDOW_MONTH_OFFSET: Record<EmployeeContractEndWindow, number> = {
  lastMonth: -1,
  thisMonth: 0,
  nextMonth: 1,
  secondNextMonth: 2,
};

/**
 * First and last day (UTC midnight) of the calendar month at `monthOffset`
 * from the reference date's local year/month.
 */
export function employeeContractEndWindowBounds(
  window: EmployeeContractEndWindow,
  referenceDate: Date = new Date(),
): { start: Date; end: Date } {
  const offset = END_WINDOW_MONTH_OFFSET[window];
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + offset;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start, end };
}

export function matchesEmployeeContractEndWindow(
  row: EmployeeContractListItem,
  window: EmployeeContractEndWindow,
  referenceDate: Date = new Date(),
): boolean {
  if (!row.endDate) {
    return false;
  }
  const endDate = parseDateOnlyUtc(row.endDate.slice(0, 10));
  const { start, end } = employeeContractEndWindowBounds(window, referenceDate);
  return endDate >= start && endDate <= end;
}

export function statusesForEmployeeContractMode(
  mode: EmployeeContractStatusMode,
): EmployeeContractStatus[] {
  switch (mode) {
    case 'active':
      return ['ACTIVE'];
    case 'ended':
      return ENDED_STATUSES;
    default:
      return [];
  }
}

/**
 * Client-side employee contract search by contract #, employee name, or ids.
 */
export function matchesEmployeeContractSearch(
  row: EmployeeContractListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName = formatEmployeeContractEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const haystack = [
    row.contractNumber,
    row.id,
    row.employeeId,
    employeeName,
    email,
    row.notes ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface EmployeeContractListFilters {
  search: string;
  statusMode?: EmployeeContractStatusMode;
  contractType?: EmployeeContractType;
  employeeId?: string;
  endWindow?: EmployeeContractEndWindow;
  /** Reference "today" for end-date windows (tests). */
  referenceDate?: Date;
}

/**
 * Filters employee contracts in memory (status mode, end-date window, type,
 * employee, search).
 */
export function filterEmployeeContracts(
  rows: EmployeeContractListItem[],
  filters: EmployeeContractListFilters,
): EmployeeContractListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';

    if (mode === 'expiringSoon') {
      if (!isEmployeeContractExpiringSoon(row)) {
        return false;
      }
    } else if (mode !== 'all') {
      const statuses = statusesForEmployeeContractMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (
      filters.endWindow &&
      !matchesEmployeeContractEndWindow(row, filters.endWindow, filters.referenceDate)
    ) {
      return false;
    }

    if (filters.contractType && row.contractType !== filters.contractType) {
      return false;
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    return matchesEmployeeContractSearch(row, filters.search);
  });
}
