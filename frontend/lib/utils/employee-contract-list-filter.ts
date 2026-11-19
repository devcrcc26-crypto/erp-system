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
 * End-date windows for the contract list, relative to today:
 * `next1`-`next3` = active contracts ending from today up to 1-3 months ahead
 * (cumulative, so `next2` includes `next1`); `last1` = any contract whose end
 * date fell in the past month.
 */
export type EmployeeContractEndWindow = 'next1' | 'next2' | 'next3' | 'last1';

export const EMPLOYEE_CONTRACT_END_WINDOWS: readonly EmployeeContractEndWindow[] = [
  'next1',
  'next2',
  'next3',
  'last1',
];

/** Today's calendar date (local) as a UTC midnight, to compare with date-only values. */
function todayUtc(referenceDate: Date): Date {
  return new Date(
    Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    ),
  );
}

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function matchesEmployeeContractEndWindow(
  row: EmployeeContractListItem,
  window: EmployeeContractEndWindow,
  referenceDate: Date = new Date(),
): boolean {
  if (!row.endDate) {
    return false;
  }
  const today = todayUtc(referenceDate);
  const endDate = parseDateOnlyUtc(row.endDate.slice(0, 10));

  if (window === 'last1') {
    return endDate < today && endDate >= addMonthsUtc(today, -1);
  }

  const months = window === 'next1' ? 1 : window === 'next2' ? 2 : 3;
  return (
    row.status === 'ACTIVE' &&
    endDate >= today &&
    endDate <= addMonthsUtc(today, months)
  );
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
