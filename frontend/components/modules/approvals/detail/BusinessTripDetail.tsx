'use client';

import { Alert, Skeleton } from 'antd';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripHostMetaItems from '@/components/modules/hr/business-trip/BusinessTripHostMetaItems';
import { hasBusinessTripHostDetails } from '@/lib/utils/business-trip-host-display';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import {
  TicketAcknowledgementCard,
  TravelBudgetBreakdown,
  TravelPassengerList,
  TravelRouteHero,
  TravelTextBlock,
  type PassengerTicketState,
} from '@/components/modules/hr/shared/TravelDetailParts';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { BusinessTripPassenger } from '@/lib/api/business-trip.types';
import {
  useAcknowledgeBusinessTripTicket,
  useBusinessTrip,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTripType,
  formatVisaStatus,
  tripTypeVariant,
} from '@/lib/utils/business-trip-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';

function passengerTicketState(
  row: BusinessTripPassenger,
  combinedTicketDocumentId?: string | null,
): PassengerTicketState {
  if (row.ticketDocumentId || (row.tickets?.length ?? 0) > 0) {
    return 'own';
  }
  return combinedTicketDocumentId ? 'combined' : 'none';
}

/**
 * Business trip body for the Approvals detail inbox (includes passenger ack).
 */
export default function BusinessTripDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useBusinessTrip(sourceId);
  const trip = detailQuery.data;
  const acknowledgeTicket = useAcknowledgeBusinessTripTicket(sourceId);

  const currentUserPassenger = trip?.passengers.find(
    (p) => p.employeeId === currentUser.data?.id,
  );

  const canAcknowledge =
    Boolean(currentUserPassenger) &&
    currentUserPassenger?.acknowledgementStatus === 'PENDING' &&
    (Boolean(currentUserPassenger?.ticketDocumentId) ||
      Boolean(trip?.combinedTicketDocumentId));

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

  if (detailQuery.isLoading && !trip) {
    return (
      <div className="erp-pro-card p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !trip) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.businessTripNotFound')
        }
      />
    );
  }

  const budgetRows = [
    {
      label: t('hr.labels.estimatedAccommodation'),
      value: trip.estimatedAccommodationCost,
    },
    { label: t('hr.labels.estimatedPerDiem'), value: trip.estimatedPerDiem },
    { label: t('hr.labels.estimatedOther'), value: trip.estimatedOtherCost },
  ];

  const hasPurposeContent =
    Boolean(trip.purpose) ||
    hasBusinessTripHostDetails(trip) ||
    Boolean(trip.expectedOutcomes) ||
    Boolean(trip.itinerary);

  const showTicketPanel =
    trip.status === 'APPROVED' ||
    Boolean(trip.combinedTicketDocumentId) ||
    trip.passengers.some((p) => p.ticketDocumentId);

  const combinedTickets =
    trip.combinedTickets && trip.combinedTickets.length > 0
      ? trip.combinedTickets
      : trip.combinedTicket
        ? [trip.combinedTicket]
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
          tripTypeLabel={formatTripType(trip.tripType, t)}
          tripTypeVariant={tripTypeVariant(trip.tripType)}
          isInternational
          requesterName={formatBusinessTripSubmitterName(trip.submitter)}
          origin={{ city: trip.originCity, country: trip.originCountry }}
          destination={{
            city: trip.destinationCity,
            country: trip.destinationCountry,
          }}
          departureDate={trip.departureDate}
          returnDate={trip.returnDate}
          passengerCount={trip.passengerCount}
          extraFact={{
            label: t('hr.labels.estimatedTotal'),
            value: formatEtb(trip.estimatedTotalCost),
          }}
        />
        <div className="border-t border-[#eef1f4]">
          <BusinessTripCurrentStepBanner trip={trip} embedded />
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

      {hasPurposeContent ? (
        <SectionCard title={t('hr.labels.purposeHost')}>
          <div className="flex flex-col gap-4">
            <BusinessTripHostMetaItems trip={trip} />
            <TravelTextBlock label={t('hr.labels.purpose')} text={trip.purpose} />
            <TravelTextBlock
              label={t('hr.labels.expectedOutcomes')}
              text={trip.expectedOutcomes}
            />
            <TravelTextBlock
              label={t('hr.labels.itinerary')}
              text={trip.itinerary}
            />
          </div>
        </SectionCard>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <SectionCard title={t('hr.travel.requirements')}>
          <div className="flex flex-col gap-4">
            <TravelTextBlock label={t('hr.labels.notes')} text={trip.notes} />
          </div>
        </SectionCard>

        <SectionCard title={t('hr.labels.budgetEstimate')} bodyClassName="p-0">
          <TravelBudgetBreakdown
            rows={budgetRows}
            totalLabel={t('hr.labels.estimatedTotal')}
            total={trip.estimatedTotalCost}
            formatAmount={formatEtb}
          />
        </SectionCard>
      </div>

      <SectionCard title={t('hr.section.passengerDetails')} bodyClassName="p-0">
        <TravelPassengerList
          passengers={trip.passengers.map((row) => ({
            id: row.id,
            name: row.employee ? formatUserName(row.employee) : row.employeeId,
            email: row.employee?.email,
            passportNumber: row.passportNumber,
            visaRequired: row.visaRequired,
            visaStatus: row.visaStatus,
            visaStatusLabel: row.visaStatus
              ? formatVisaStatus(row.visaStatus, t)
              : null,
            ticket: passengerTicketState(row, trip.combinedTicketDocumentId),
          }))}
        />
      </SectionCard>

      {showTicketPanel ? <BusinessTripTicketAssignmentPanel trip={trip} /> : null}

      {(trip.documents?.length ?? 0) > 0 ? (
        <SectionCard title={t('hr.section.supportingDocuments')}>
          <AttachmentDownloadList documents={trip.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
