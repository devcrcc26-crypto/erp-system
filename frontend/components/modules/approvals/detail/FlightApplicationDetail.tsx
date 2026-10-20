'use client';

import { Alert, Skeleton } from 'antd';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import FlightTicketAssignmentPanel from '@/components/modules/hr/flight/FlightTicketAssignmentPanel';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import {
  TicketAcknowledgementCard,
  TravelPassengerList,
  TravelRouteHero,
  TravelTextBlock,
  type PassengerTicketState,
} from '@/components/modules/hr/shared/TravelDetailParts';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { FlightPassenger } from '@/lib/api/flight.types';
import {
  useAcknowledgeTicket,
  useFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatFlightSubmitterName,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/flight-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

function passengerTicketState(
  row: FlightPassenger,
  combinedTicketDocumentId?: string | null,
): PassengerTicketState {
  if (row.ticketDocumentId || (row.tickets?.length ?? 0) > 0) {
    return 'own';
  }
  return combinedTicketDocumentId ? 'combined' : 'none';
}

/**
 * Flight application body for the Approvals detail inbox (includes passenger ack).
 */
export default function FlightApplicationDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useFlightApplication(sourceId);
  const application = detailQuery.data;
  const acknowledgeTicket = useAcknowledgeTicket(sourceId);

  const currentUserPassenger = application?.passengers.find(
    (p) => p.employeeId === currentUser.data?.id,
  );

  const canAcknowledge =
    Boolean(currentUserPassenger) &&
    currentUserPassenger?.acknowledgementStatus === 'PENDING' &&
    (Boolean(currentUserPassenger?.ticketDocumentId) ||
      Boolean(application?.combinedTicketDocumentId));

  async function handleAcknowledge(): Promise<void> {
    if (!currentUserPassenger) {
      return;
    }
    try {
      await acknowledgeTicket.mutateAsync(currentUserPassenger.id);
      messageApi.success(t('hr.travel.ticketAcknowledged'));
    } catch (error: unknown) {
      notifyApiError(error, t('hr.travel.acknowledgeFailed'), messageApi);
    }
  }

  if (detailQuery.isLoading && !application) {
    return (
      <div className="erp-pro-card p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.flightApplicationNotFound')
        }
      />
    );
  }

  const tripTypeLabel = formatTripType(application.tripType, t);

  const showTicketPanel =
    application.status === 'APPROVED' ||
    Boolean(application.combinedTicketDocumentId) ||
    application.passengers.some((p) => p.ticketDocumentId);

  const combinedTickets =
    application.combinedTickets && application.combinedTickets.length > 0
      ? application.combinedTickets
      : application.combinedTicket
        ? [application.combinedTicket]
        : [];

  const passengerTickets =
    currentUserPassenger?.tickets && currentUserPassenger.tickets.length > 0
      ? currentUserPassenger.tickets
      : currentUserPassenger?.ticket
        ? [currentUserPassenger.ticket]
        : [];

  return (
    <div className="flex flex-col gap-3">
      {/* The approval page header already shows the request number and status. */}
      <div className="erp-pro-card overflow-hidden">
        <TravelRouteHero
          tripTypeLabel={tripTypeLabel}
          tripTypeVariant={tripTypeVariant(application.tripType)}
          isInternational={application.isInternational}
          requesterName={formatFlightSubmitterName(application.submitter)}
          origin={{
            city: application.originCity,
            country: application.originCountry,
          }}
          destination={{ country: application.destination }}
          departureDate={application.departureDate}
          returnDate={application.returnDate}
          ticketClassLabel={formatTicketClass(application.ticketClass, t)}
          passengerCount={application.passengerCount}
        />
        <div className="border-t border-[#eef1f4]">
          <FlightCurrentStepBanner application={application} embedded />
        </div>
      </div>

      {canAcknowledge && currentUserPassenger ? (
        <TicketAcknowledgementCard
          combinedTickets={combinedTickets}
          passengerTickets={passengerTickets}
          acknowledging={acknowledgeTicket.isPending}
          onAcknowledge={() => void handleAcknowledge()}
        />
      ) : null}

      <SectionCard title={t('hr.travel.requirements')}>
        <div className="flex flex-col gap-4">
          <TravelTextBlock
            label={t('hr.labels.purpose')}
            text={application.purpose}
          />
          <TravelTextBlock
            label={t('hr.labels.notes')}
            text={application.notes}
          />
        </div>
      </SectionCard>

      <SectionCard title={t('hr.section.passengerDetails')} bodyClassName="p-0">
        <TravelPassengerList
          passengers={application.passengers.map((row) => ({
            id: row.id,
            name: row.employee ? formatUserName(row.employee) : row.employeeId,
            email: row.employee?.email,
            passportNumber: row.passportNumber,
            visaRequired: row.visaRequired,
            visaStatus: row.visaStatus,
            visaStatusLabel: row.visaStatus
              ? formatVisaStatus(row.visaStatus, t)
              : null,
            ticket: passengerTicketState(
              row,
              application.combinedTicketDocumentId,
            ),
          }))}
        />
      </SectionCard>

      {showTicketPanel ? (
        <FlightTicketAssignmentPanel application={application} />
      ) : null}

      {(application.documents?.length ?? 0) > 0 ? (
        <SectionCard title={t('hr.section.supportingDocuments')}>
          <AttachmentDownloadList documents={application.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
