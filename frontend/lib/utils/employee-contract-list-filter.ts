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
}

/**
 * Filters employee contracts in memory (status mode, type, employee, search).
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

    if (filters.contractType && row.contractType !== filters.contractType) {
      return false;
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    return matchesEmployeeContractSearch(row, filters.search);
  });
}
