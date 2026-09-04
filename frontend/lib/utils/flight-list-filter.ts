import type {
  FlightApplicationListItem,
  FlightApplicationStatus,
} from '@/lib/api/flight.types';
import { formatFlightSubmitterName } from '@/lib/utils/flight-display';

export type FlightStatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: FlightApplicationStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: FlightApplicationStatus[] = ['APPROVED'];
const REJECTED_STATUSES: FlightApplicationStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForFlightMode(
  mode: FlightStatusMode,
): FlightApplicationStatus[] {
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
 * Client-side flight application search by #, route, submitter, or ids.
 */
export function matchesFlightApplicationSearch(
  row: FlightApplicationListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const submitterName = formatFlightSubmitterName(row.submitter).toLowerCase();
  const email = (row.submitter?.email ?? '').toLowerCase();
  const haystack = [
    row.applicationNumber,
    row.id,
    row.submittedBy,
    row.originCity,
    row.originCountry,
    row.destination,
    `${row.originCity} ${row.originCountry} ${row.destination}`,
    submitterName,
    email,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

function departureInRange(
  departureDate: string,
  dateFrom?: string,
  dateTo?: string,
): boolean {
  if (!dateFrom && !dateTo) {
    return true;
  }
  const day = departureDate.slice(0, 10);
  if (dateFrom && day < dateFrom) {
    return false;
  }
  if (dateTo && day > dateTo) {
    return false;
  }
  return true;
}

export interface FlightApplicationListFilters {
  search: string;
  statusMode?: FlightStatusMode;
  needsTicket?: boolean;
  isInternational?: boolean;
  submittedById?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters flight applications in memory (status, ticket need, route type, search).
 */
export function filterFlightApplications(
  rows: FlightApplicationListItem[],
  filters: FlightApplicationListFilters,
): FlightApplicationListItem[] {
  return rows.filter((row) => {
    if (filters.needsTicket) {
      if (row.needsTicketAttachment !== true) {
        return false;
      }
    } else {
      const mode = filters.statusMode ?? 'all';
      if (mode !== 'all') {
        const statuses = statusesForFlightMode(mode);
        if (statuses.length > 0 && !statuses.includes(row.status)) {
          return false;
        }
      }
    }

    if (
      filters.isInternational !== undefined &&
      row.isInternational !== filters.isInternational
    ) {
      return false;
    }

    if (
      filters.submittedById &&
      row.submittedBy !== filters.submittedById
    ) {
      return false;
    }

    if (!departureInRange(row.departureDate, filters.dateFrom, filters.dateTo)) {
      return false;
    }

    return matchesFlightApplicationSearch(row, filters.search);
  });
}
