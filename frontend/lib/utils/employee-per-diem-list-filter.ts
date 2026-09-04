import type { EmployeePerDiemRateListItem } from '@/lib/api/per-diem.types';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';
import { formatUserName } from '@/lib/utils/user-display';

export type EmployeePerDiemSetupFilter = 'all' | 'configured' | 'pending';

export function countActivePerDiemCategories(
  row: EmployeePerDiemRateListItem['rate'],
): number {
  if (!row) {
    return 0;
  }
  return PER_DIEM_DESTINATION_CATEGORIES.filter((category) => {
    const { active } = PER_DIEM_CATEGORY_FIELDS[category];
    return row[active];
  }).length;
}

/**
 * Client-side search by employee name, email, or department.
 */
export function matchesEmployeePerDiemSearch(
  row: EmployeePerDiemRateListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    formatUserName(row.employee),
    row.employee.email ?? '',
    row.employee.department?.name ?? '',
    row.employeeId,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface EmployeePerDiemListFilters {
  search: string;
  setupFilter?: EmployeePerDiemSetupFilter;
}

/**
 * Filters employee per diem rate rows in memory.
 */
export function filterEmployeePerDiemRates(
  rows: EmployeePerDiemRateListItem[],
  filters: EmployeePerDiemListFilters,
): EmployeePerDiemRateListItem[] {
  return rows.filter((row) => {
    const setup = filters.setupFilter ?? 'all';
    if (setup === 'configured' && row.rate == null) {
      return false;
    }
    if (setup === 'pending' && row.rate != null) {
      return false;
    }
    return matchesEmployeePerDiemSearch(row, filters.search);
  });
}
