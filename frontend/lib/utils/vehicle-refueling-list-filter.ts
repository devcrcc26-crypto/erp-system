import type {
  VehicleRefuelingListItem,
  VehicleRefuelingStatus,
} from '@/lib/api/vehicle-refueling.types';
import { formatVehicleRefuelingEmployeeName } from '@/lib/utils/vehicle-refueling-display';

export type VehicleRefuelingStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: VehicleRefuelingStatus[] = ['DRAFT'];
const PENDING_STATUSES: VehicleRefuelingStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: VehicleRefuelingStatus[] = ['APPROVED'];
const REJECTED_STATUSES: VehicleRefuelingStatus[] = [
  'REJECTED',
  'CANCELLED',
];

export function statusesForVehicleRefuelingMode(
  mode: VehicleRefuelingStatusMode,
): VehicleRefuelingStatus[] {
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

/**
 * Client-side vehicle refueling search by #, station, plate, employee.
 */
export function matchesVehicleRefuelingSearch(
  row: VehicleRefuelingListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName =
    formatVehicleRefuelingEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const vehicleLabel = row.vehicle
    ? `${row.vehicle.plateNumber} ${row.vehicle.make} ${row.vehicle.model}`
    : '';
  const haystack = [
    row.requestNumber,
    row.fuelStation,
    row.fuelType,
    row.id,
    row.employeeId,
    employeeName,
    email,
    vehicleLabel,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

export interface VehicleRefuelingListFilters {
  search: string;
  statusMode?: VehicleRefuelingStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters vehicle refueling requests in memory.
 */
export function filterVehicleRefuelings(
  rows: VehicleRefuelingListItem[],
  filters: VehicleRefuelingListFilters,
): VehicleRefuelingListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForVehicleRefuelingMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateKey = (row.fuelDate ?? row.createdAt ?? '').slice(0, 10);
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

    return matchesVehicleRefuelingSearch(row, filters.search);
  });
}
