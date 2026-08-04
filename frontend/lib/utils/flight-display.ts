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

/**
 * Resolves the post-status workflow step for banners and list columns.
 */
export function getCurrentStep(
  application: FlightStepSource,
): FlightCurrentStep | null {
  switch (application.status) {
    case 'DRAFT':
      return {
        step: 'Draft',
        description: 'Not yet submitted',
        color: 'gray',
      };
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return {
        step: 'Under Review',
        description: 'Awaiting approval',
        color: 'blue',
      };
    case 'RETURNED':
      return {
        step: 'Returned',
        description: 'Changes requested — please resubmit',
        color: 'orange',
      };
    case 'REJECTED':
      return {
        step: 'Rejected',
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

      if (allAcknowledged) {
        return {
          step: 'Completed',
          description: 'All tickets acknowledged',
          color: 'green',
        };
      }

      if (allTicketsAttached) {
        return {
          step: 'Awaiting Acknowledgement',
          description:
            'Tickets attached — passengers must acknowledge receipt',
          color: 'blue',
        };
      }

      // List rows may only ship currentStepLabel / needsTicketAttachment
      if (application.currentStepLabel === 'Completed') {
        return {
          step: 'Completed',
          description: 'All tickets acknowledged',
          color: 'green',
        };
      }
      if (application.currentStepLabel === 'Awaiting Acknowledgement') {
        return {
          step: 'Awaiting Acknowledgement',
          description:
            'Tickets attached — passengers must acknowledge receipt',
          color: 'blue',
        };
      }
      if (
        application.needsTicketAttachment === false &&
        !application.currentStepLabel
      ) {
        return {
          step: 'Awaiting Acknowledgement',
          description:
            'Tickets attached — passengers must acknowledge receipt',
          color: 'blue',
        };
      }

      return {
        step: 'Buying Ticket',
        description: 'Approved — HR is arranging ticket booking',
        color: 'amber',
      };
    }
    case 'CANCELLED':
      return {
        step: 'Cancelled',
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
export function getCurrentStepLabel(application: FlightStepSource): string {
  if (application.status === 'APPROVED') {
    return (
      application.currentStepLabel ??
      getCurrentStep(application)?.step ??
      'Buying Ticket'
    );
  }
  if (application.currentTierLabel) {
    return application.currentTierLabel;
  }
  return getCurrentStep(application)?.step ?? '—';
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
