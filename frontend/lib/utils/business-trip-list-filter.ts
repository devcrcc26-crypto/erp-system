import type {
  BusinessTripListItem,
  BusinessTripStatus,
} from '@/lib/api/business-trip.types';
import { formatBusinessTripSubmitterName } from '@/lib/utils/business-trip-display';

export type BusinessTripStatusMode =
  | 'all'
  | 'pending'
  | 'approved'
  | 'rejected';

const PENDING_STATUSES: BusinessTripStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: BusinessTripStatus[] = ['APPROVED'];
const REJECTED_STATUSES: BusinessTripStatus[] = ['REJECTED', 'CANCELLED'];

export function statusesForBusinessTripMode(
  mode: BusinessTripStatusMode,
): BusinessTripStatus[] {
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
 * Client-side business trip search by #, destination, submitter, or ids.
 */
export function matchesBusinessTripSearch(
  row: BusinessTripListItem,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const submitterName =
    formatBusinessTripSubmitterName(row.submitter).toLowerCase();
  const email = (row.submitter?.email ?? '').toLowerCase();
  const haystack = [
    row.tripNumber,
    row.id,
    row.submittedBy,
    row.originCity,
    row.originCountry,
    row.destinationCountry,
    row.destinationCity,
    `${row.destinationCountry} ${row.destinationCity}`,
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

export interface BusinessTripListFilters {
  search: string;
  statusMode?: BusinessTripStatusMode;
  needsTicket?: boolean;
  destinationCountry?: string;
  submittedById?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Filters business trips in memory (status, ticket need, destination, search).
 */
export function filterBusinessTrips(
  rows: BusinessTripListItem[],
  filters: BusinessTripListFilters,
): BusinessTripListItem[] {
  return rows.filter((row) => {
    if (filters.needsTicket) {
      if (row.needsTicketAttachment !== true) {
        return false;
      }
    } else {
      const mode = filters.statusMode ?? 'all';
      if (mode !== 'all') {
        const statuses = statusesForBusinessTripMode(mode);
        if (statuses.length > 0 && !statuses.includes(row.status)) {
          return false;
        }
      }
    }

    const countryNeedle = filters.destinationCountry?.trim().toLowerCase();
    if (countryNeedle) {
      const haystack = [
        row.destinationCountry,
        row.destinationCity,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(countryNeedle)) {
        return false;
      }
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

    return matchesBusinessTripSearch(row, filters.search);
  });
}
