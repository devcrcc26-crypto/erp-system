import type {
  VehicleApplicationListItem,
  VehicleApplicationStatus,
} from '@/lib/api/vehicle-application.types';
import { formatVehicleApplicationEmployeeName } from '@/lib/utils/vehicle-application-display';

export type VehicleApplicationStatusMode =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected';

export const DRAFT_STATUSES: VehicleApplicationStatus[] = ['DRAFT'];
const PENDING_STATUSES: VehicleApplicationStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
];
const APPROVED_STATUSES: VehicleApplicationStatus[] = ['APPROVED'];
const REJECTED_STATUSES: VehicleApplicationStatus[] = [
  'REJECTED',
  'CANCELLED',
];

export function statusesForVehicleApplicationMode(
  mode: VehicleApplicationStatusMode,
): VehicleApplicationStatus[] {
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
 * Client-side vehicle application search by #, destination, plate, employee.
 */
export function matchesVehicleApplicationSearch(
  row: VehicleApplicationListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const employeeName =
    formatVehicleApplicationEmployeeName(row.employee).toLowerCase();
  const email = (row.employee?.email ?? '').toLowerCase();
  const vehicleLabel = row.vehicle
    ? `${row.vehicle.plateNumber} ${row.vehicle.make} ${row.vehicle.model}`
    : '';
  const haystack = [
    row.applicationNumber,
    row.destination,
    row.purpose,
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

export interface VehicleApplicationListFilters {
  search: string;
  statusMode?: VehicleApplicationStatusMode;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters vehicle applications in memory.
 */
export function filterVehicleApplications(
  rows: VehicleApplicationListItem[],
  filters: VehicleApplicationListFilters,
): VehicleApplicationListItem[] {
  return rows.filter((row) => {
    const mode = filters.statusMode ?? 'all';
    if (mode !== 'all') {
      const statuses = statusesForVehicleApplicationMode(mode);
      if (statuses.length > 0 && !statuses.includes(row.status)) {
        return false;
      }
    }

    if (filters.employeeId && row.employeeId !== filters.employeeId) {
      return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateKey = (row.departureDatetime ?? row.createdAt ?? '').slice(
        0,
        10,
      );
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

    return matchesVehicleApplicationSearch(row, filters.search);
  });
}
