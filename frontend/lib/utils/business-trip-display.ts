import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  BusinessTripStatus,
  BusinessTripUserSummary,
  FlightTripType,
} from '@/lib/api/business-trip.types';
import { tokens } from '@/lib/theme/tokens';
import {
  FLIGHT_TICKET_CLASS_OPTIONS,
  FLIGHT_TRIP_TYPE_OPTIONS,
  FLIGHT_VISA_STATUS_OPTIONS,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/flight-display';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export {
  FLIGHT_TICKET_CLASS_OPTIONS as BUSINESS_TRIP_TICKET_CLASS_OPTIONS,
  FLIGHT_VISA_STATUS_OPTIONS as BUSINESS_TRIP_VISA_STATUS_OPTIONS,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
};

export const BUSINESS_TRIP_STATUS_OPTIONS: Array<{
  value: BusinessTripStatus;
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

export const BUSINESS_TRIP_TYPE_OPTIONS: Array<{
  value: FlightTripType;
  label: string;
}> = FLIGHT_TRIP_TYPE_OPTIONS;

export function formatBusinessTripStatus(
  status: BusinessTripStatus | string,
  t?: TFn,
): string {
  if (t) return t(`hr.status.${status}`);
  const found = BUSINESS_TRIP_STATUS_OPTIONS.find((o) => o.value === status);
  if (found) {
    return found.label;
  }
  return status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function businessTripStatusVariant(
  status: BusinessTripStatus | string,
): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'RETURNED':
      return 'warning';
    case 'SUBMITTED':
      return 'info';
    case 'IN_REVIEW':
      return 'warning';
    case 'CANCELLED':
    case 'DRAFT':
    default:
      return 'default';
  }
}

export function formatBusinessTripSubmitterName(
  user?: BusinessTripUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}

/**
 * Formats an amount as Ethiopian Birr for display.
 */
export function formatEtb(
  amount: number | string | null | undefined,
): string {
  if (amount == null || amount === '') {
    return '-';
  }
  const num = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(num)) {
    return '-';
  }
  return `ETB ${num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export type BusinessTripCurrentStepColor =
  | 'gray'
  | 'blue'
  | 'orange'
  | 'red'
  | 'amber'
  | 'green';

export interface BusinessTripCurrentStep {
  step: string;
  description: string;
  color: BusinessTripCurrentStepColor;
}

type BusinessTripStepSource = {
  status: BusinessTripStatus | string;
  rejectionNote?: string | null;
  combinedTicketDocumentId?: string | null;
  passengers?: Array<{
    ticketDocumentId?: string | null;
    acknowledgementStatus?: string | null;
  }>;
  needsTicketAttachment?: boolean;
  currentTierLabel?: string | null;
  currentStepLabel?: string | null;
};

function tr(t: TFn | undefined, key: string, fallback: string): string {
  return t ? t(key) : fallback;
}

/**
 * Resolves the post-status workflow step for banners and list columns.
 */
export function getCurrentStep(
  trip: BusinessTripStepSource,
  t?: TFn,
): BusinessTripCurrentStep | null {
  switch (trip.status) {
    case 'DRAFT':
      return {
        step: tr(t, 'hr.status.DRAFT', 'Draft'),
        description: 'Not yet submitted',
        color: 'gray',
      };
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return {
        step: tr(t, 'hr.status.IN_REVIEW', 'Under Review'),
        description: 'Awaiting approval',
        color: 'blue',
      };
    case 'RETURNED':
      return {
        step: tr(t, 'hr.status.RETURNED', 'Returned'),
        description: 'Changes requested - please resubmit',
        color: 'orange',
      };
    case 'REJECTED':
      return {
        step: tr(t, 'hr.status.REJECTED', 'Rejected'),
        description: trip.rejectionNote ?? '',
        color: 'red',
      };
    case 'APPROVED': {
      const passengers = trip.passengers ?? [];
      const allTicketsAttached =
        trip.combinedTicketDocumentId != null ||
        (passengers.length > 0 &&
          passengers.every((p) => p.ticketDocumentId != null));
      const allAcknowledged =
        passengers.length > 0 &&
        passengers.every((p) => p.acknowledgementStatus === 'ACKNOWLEDGED');

      const completedStep = (): BusinessTripCurrentStep => ({
        step: tr(t, 'hr.labels.completed', 'Completed'),
        description: tr(
          t,
          'hr.labels.completedDesc',
          'All tickets acknowledged',
        ),
        color: 'green',
      });

      const awaitingStep = (): BusinessTripCurrentStep => ({
        step: tr(
          t,
          'hr.labels.awaitingAcknowledgement',
          'Awaiting Acknowledgement',
        ),
        description: tr(
          t,
          'hr.labels.awaitingAcknowledgementDesc',
          'Tickets attached - passengers must acknowledge receipt',
        ),
        color: 'blue',
      });

      if (allAcknowledged) {
        return completedStep();
      }

      if (allTicketsAttached) {
        return awaitingStep();
      }

      if (trip.currentStepLabel === 'Completed') {
        return completedStep();
      }
      if (trip.currentStepLabel === 'Awaiting Acknowledgement') {
        return awaitingStep();
      }
      if (trip.needsTicketAttachment === false && !trip.currentStepLabel) {
        return awaitingStep();
      }

      return {
        step: tr(t, 'hr.labels.buyingTicket', 'Buying Ticket'),
        description: tr(
          t,
          'hr.labels.buyingTicketDesc',
          'Approved - HR is arranging ticket booking',
        ),
        color: 'amber',
      };
    }
    case 'CANCELLED':
      return {
        step: tr(t, 'hr.status.CANCELLED', 'Cancelled'),
        description: 'Trip cancelled',
        color: 'gray',
      };
    default:
      return null;
  }
}

/**
 * List-column label: APPROVED uses workflow step; otherwise current tier or step name.
 */
export function getCurrentStepLabel(
  trip: BusinessTripStepSource,
  t?: TFn,
): string {
  if (trip.status === 'APPROVED') {
    return (
      trip.currentStepLabel ??
      getCurrentStep(trip, t)?.step ??
      tr(t, 'hr.labels.buyingTicket', 'Buying Ticket')
    );
  }
  if (trip.currentTierLabel) {
    return trip.currentTierLabel;
  }
  return getCurrentStep(trip, t)?.step ?? '-';
}

/**
 * Inline styles for the current-step banner (theme tokens).
 */
export function businessTripCurrentStepBannerStyle(
  color: BusinessTripCurrentStepColor,
): { background: string; borderColor: string; color: string } {
  switch (color) {
    case 'amber':
      return {
        background: tokens.colorAmber50,
        borderColor: tokens.colorAmber400,
        color: tokens.colorAmber400,
      };
    case 'blue':
      return {
        background: tokens.colorBlue50,
        borderColor: tokens.colorBlue400,
        color: tokens.colorBlue800,
      };
    case 'green':
      return {
        background: tokens.colorGreen50,
        borderColor: tokens.colorGreen400,
        color: tokens.colorGreen600,
      };
    case 'orange':
      return {
        background: tokens.colorCoral50,
        borderColor: tokens.colorCoral400,
        color: tokens.colorCoral400,
      };
    case 'red':
      return {
        background: tokens.colorRed50,
        borderColor: tokens.colorRed400,
        color: tokens.colorRed600,
      };
    case 'gray':
    default:
      return {
        background: tokens.colorGray50,
        borderColor: tokens.colorGray200,
        color: tokens.colorGray600,
      };
  }
}
