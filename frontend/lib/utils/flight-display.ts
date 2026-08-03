import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  FlightApplicationStatus,
  FlightTicketClass,
  FlightTripType,
  FlightUserSummary,
  FlightVisaStatus,
} from '@/lib/api/flight.types';
import { formatUserName } from '@/lib/utils/user-display';

export const FLIGHT_STATUS_OPTIONS: Array<{
  value: FlightApplicationStatus;
  label: string;
}> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const FLIGHT_TRIP_TYPE_OPTIONS: Array<{
  value: FlightTripType;
  label: string;
}> = [
  { value: 'ONE_WAY', label: 'One Way' },
  { value: 'ROUND_TRIP', label: 'Round Trip' },
];

export const FLIGHT_TICKET_CLASS_OPTIONS: Array<{
  value: FlightTicketClass;
  label: string;
}> = [
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'BUSINESS', label: 'Business' },
];

export const FLIGHT_VISA_STATUS_OPTIONS: Array<{
  value: FlightVisaStatus;
  label: string;
}> = [
  { value: 'NOT_APPLIED', label: 'Not Applied' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'APPROVED', label: 'Approved' },
];

export function formatFlightStatus(status: FlightApplicationStatus | string): string {
  const found = FLIGHT_STATUS_OPTIONS.find((o) => o.value === status);
  if (found) {
    return found.label;
  }
  return status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function flightStatusVariant(
  status: FlightApplicationStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    case 'RETURNED':
      return 'orange';
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'warning';
    case 'DRAFT':
    default:
      return 'default';
  }
}

export function formatTripType(tripType: FlightTripType | string): string {
  const found = FLIGHT_TRIP_TYPE_OPTIONS.find((o) => o.value === tripType);
  return found?.label ?? tripType;
}

export function tripTypeVariant(
  tripType: FlightTripType | string,
): StatusBadgeVariant {
  return tripType === 'ROUND_TRIP' ? 'info' : 'cyan';
}

export function formatTicketClass(ticketClass: FlightTicketClass | string): string {
  const found = FLIGHT_TICKET_CLASS_OPTIONS.find((o) => o.value === ticketClass);
  return found?.label ?? ticketClass;
}

export function formatVisaStatus(visaStatus: FlightVisaStatus | string): string {
  const found = FLIGHT_VISA_STATUS_OPTIONS.find((o) => o.value === visaStatus);
  return found?.label ?? visaStatus;
}

export function formatFlightSubmitterName(
  user?: FlightUserSummary | null,
): string {
  if (!user) {
    return '—';
  }
  return formatUserName(user);
}
