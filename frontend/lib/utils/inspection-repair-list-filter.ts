import type {
  InspectionRepairListItem,
  InspectionRepairStatus,
} from '@/lib/api/inspection-repair.types';
import { formatInspectionRepairEmployeeName } from '@/lib/utils/inspection-repair-display';

export type InspectionRepairStatusMode =
  | 'all'
  | 'pending'
  | 'active'
  | 'done';

const PENDING_STATUSES: InspectionRepairStatus[] = ['DRAFT', 'SUBMITTED'];
const ACTIVE_STATUSES: InspectionRepairStatus[] = ['IN_REPAIR'];
const DONE_STATUSES: InspectionRepairStatus[] = ['REPAIRED', 'REJECTED'];

export function statusesForInspectionRepairMode(
  mode: InspectionRepairStatusMode,
): InspectionRepairStatus[] {
  switch (mode) {
    case 'pending':
      return PENDING_STATUSES;
    case 'active':
      return ACTIVE_STATUSES;
    case 'done':
      return DONE_STATUSES;
    default:
      return [];
  }
}

/**
 * Client-side inspection/repair search by #, device, location, employee.
 */
export function matchesInspectionRepairSearch(
  row: InspectionRepairListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName =
    formatInspectionRepairEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const assetLabel = row.asset
    ? `${row.asset.serialNumber} ${row.asset.brand} ${row.asset.model}`
    : '';
  const haystack = [
    row.requestNumber,
    row.deviceName,
    row.location,
    row.make,
    row.model,
    row.description,
    row.id,
    row.employeeId,
    employeeName,
    email,
    assetLabel,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface InspectionRepairListFilters {
  search: string;
  statusMode?: InspectionRepairStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters inspection & repair requests in memory.
 */
export function filterInspectionRepairs(
  rows: InspectionRepairListItem[],
  filters: InspectionRepairListFilters,
): InspectionRepairListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForInspectionRepairMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateKey = (row.createdAt ?? '').slice(0, 10);
      if (!dateKey) {
        return false;
      }
      if (filters.dateFrom && dateKey < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && dateKey > filters.dateTo) {
        return false;
      }
    }

    return matchesInspectionRepairSearch(row, filters.search);
  });
}
