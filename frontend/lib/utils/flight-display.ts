import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import type {
  FlightApplicationStatus,
  FlightTicketClass,
  FlightTripType,
  FlightUserSummary,
  FlightVisaStatus,
} from '@/lib/api/flight.types';
import { tokens } from '@/lib/theme/tokens';
import { formatUserName } from '@/lib/utils/user-display';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

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

export function formatFlightStatus(
  status: FlightApplicationStatus | string,
  t?: TFn,
): string {
  if (t) return t(`hr.status.${status}`);
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

export function formatTripType(
  tripType: FlightTripType | string,
  t?: TFn,
): string {
  if (t) return t(`hr.tripType.${tripType}`);
  const found = FLIGHT_TRIP_TYPE_OPTIONS.find((o) => o.value === tripType);
  return found?.label ?? tripType;
}

export function tripTypeVariant(
  tripType: FlightTripType | string,
): StatusBadgeVariant {
  return tripType === 'ROUND_TRIP' ? 'info' : 'cyan';
}

export function formatTicketClass(
  ticketClass: FlightTicketClass | string,
  t?: TFn,
): string {
  if (t) return t(`hr.ticketClass.${ticketClass}`);
  const found = FLIGHT_TICKET_CLASS_OPTIONS.find((o) => o.value === ticketClass);
  return found?.label ?? ticketClass;
}

export function formatVisaStatus(
  visaStatus: FlightVisaStatus | string,
  t?: TFn,
): string {
  if (t) return t(`hr.visaStatus.${visaStatus}`);
  const found = FLIGHT_VISA_STATUS_OPTIONS.find((o) => o.value === visaStatus);
  return found?.label ?? visaStatus;
}

export function formatFlightSubmitterName(
  user?: FlightUserSummary | null,
): string {
  if (!user) {
    return '-';
  }
  return formatUserName(user);
}

export type FlightCurrentStepColor =
  | 'gray'
  | 'blue'
  | 'orange'
  | 'red'
  | 'amber'
  | 'green';

export interface FlightCurrentStep {
  step: string;
  description: string;
  color: FlightCurrentStepColor;
}

type FlightStepSource = {
  status: FlightApplicationStatus | string;
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
  application: FlightStepSource,
  t?: TFn,
): FlightCurrentStep | null {
  switch (application.status) {
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
        description: application.rejectionNote ?? '',
        color: 'red',
      };
    case 'APPROVED': {
      const passengers = application.passengers ?? [];
      const allTicketsAttached =
        application.combinedTicketDocumentId != null ||
        (passengers.length > 0 &&
          passengers.every((p) => p.ticketDocumentId != null));
      const allAcknowledged =
        passengers.length > 0 &&
        passengers.every((p) => p.acknowledgementStatus === 'ACKNOWLEDGED');

      const completedStep = (): FlightCurrentStep => ({
        step: tr(t, 'hr.labels.completed', 'Completed'),
        description: tr(
          t,
          'hr.labels.completedDesc',
          'All tickets acknowledged',
        ),
        color: 'green',
      });

      const awaitingStep = (): FlightCurrentStep => ({
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

      if (application.currentStepLabel === 'Completed') {
        return completedStep();
      }
      if (application.currentStepLabel === 'Awaiting Acknowledgement') {
        return awaitingStep();
      }
      if (
        application.needsTicketAttachment === false &&
        !application.currentStepLabel
      ) {
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
        description: 'Application cancelled',
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
  application: FlightStepSource,
  t?: TFn,
): string {
  if (application.status === 'APPROVED') {
    return (
      application.currentStepLabel ??
      getCurrentStep(application, t)?.step ??
      tr(t, 'hr.labels.buyingTicket', 'Buying Ticket')
    );
  }
  if (application.currentTierLabel) {
    return application.currentTierLabel;
  }
  return getCurrentStep(application, t)?.step ?? '-';
}

/**
 * Inline styles for the current-step banner (theme tokens).
 */
export function flightCurrentStepBannerStyle(
  color: FlightCurrentStepColor,
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
