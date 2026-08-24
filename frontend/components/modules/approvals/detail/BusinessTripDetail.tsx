'use client';

import { Alert, Button, Skeleton, Tag } from 'antd';
import {
  ArrowRight,
  BedDouble,
  Building2,
  Calendar,
  FileText,
  MapPin,
  Plane,
  Target,
  Users,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { BusinessTripPassenger } from '@/lib/api/business-trip.types';
import {
  useAcknowledgeBusinessTripTicket,
  useBusinessTrip,
} from '@/lib/query/business-trip';
import { useCurrentUser } from '@/lib/query/profile';
import {
  businessTripStatusVariant,
  formatBusinessTripStatus,
  formatBusinessTripSubmitterName,
  formatEtb,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
} from '@/lib/utils/business-trip-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

function SectionCard({
  title,
  children,
  action,
  bodyClassName = 'p-0',
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          {title}
        </h3>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

function SubsectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}): React.ReactNode {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[var(--color-text-tertiary)] flex-shrink-0">
          {icon}
        </span>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
          {title}
        </h4>
      </div>
    </div>
  );
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
        {label}
      </p>
      <div className="text-sm text-[var(--color-text-primary)]">{children}</div>
    </div>
  );
}

function TripSummaryStrip({
  departureDate,
  returnDate,
  passengerCount,
  ticketClass,
  estimatedTotalCost,
}: {
  departureDate: string;
  returnDate?: string | null;
  passengerCount: number;
  ticketClass: string;
  estimatedTotalCost?: number | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const items = [
    { label: t('hr.labels.departure'), value: formatProjectDate(departureDate) },
    {
      label: t('hr.labels.return'),
      value: returnDate ? formatProjectDate(returnDate) : 'One way',
    },
    { label: t('hr.labels.passengers'), value: String(passengerCount) },
    { label: t('hr.labels.ticketClass'), value: formatTicketClass(ticketClass, t) },
    {
      label: t('hr.labels.estimatedTotal'),
      value: formatEtb(estimatedTotalCost),
      emphasize: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(({ label, value, emphasize }) => (
        <div
          key={label}
          className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] px-4 py-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
            {label}
          </p>
          <p
            className={`text-sm leading-snug ${
              emphasize
                ? 'text-base font-bold text-[var(--color-text-primary)]'
                : 'font-semibold text-[var(--color-text-primary)]'
            }`}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function passengerHasTicket(
  row: BusinessTripPassenger,
  combinedTicketDocumentId?: string | null,
): boolean {
  return (
    Boolean(row.ticketDocumentId) ||
    (row.tickets?.length ?? 0) > 0 ||
    Boolean(combinedTicketDocumentId)
  );
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
      messageApi.success('Ticket acknowledged');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to acknowledge ticket', messageApi);
    }
  }

  if (detailQuery.isLoading && !trip) {
    return (
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !trip) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Business trip not found'
        }
      />
    );
  }

  const destinationLabel = trip.destinationCity
    ? `${trip.destinationCity}, ${trip.destinationCountry}`
    : trip.destinationCountry;
  const originLabel = `${trip.originCity}, ${trip.originCountry}`;

  const visaRequiredCount = trip.passengers.filter((p) => p.visaRequired).length;
  const ticketedCount = trip.passengers.filter((p) =>
    passengerHasTicket(p, trip.combinedTicketDocumentId),
  ).length;

  const budgetRows = [
    { label: 'Flight', value: trip.estimatedFlightCost },
    { label: 'Accommodation', value: trip.estimatedAccommodationCost },
    { label: 'Per Diem', value: trip.estimatedPerDiem },
    { label: 'Other', value: trip.estimatedOtherCost },
  ];

  const hasPurposeContent =
    Boolean(trip.purpose) ||
    Boolean(trip.hostOrganization) ||
    Boolean(trip.hostContact) ||
    Boolean(trip.expectedOutcomes) ||
    Boolean(trip.itinerary);

  const hasHost =
    Boolean(trip.hostOrganization) || Boolean(trip.hostContact);

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
      {/* Header */}
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-3 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {trip.tripNumber}
            </span>
            <span className="text-[var(--color-border-secondary)]">路</span>
            <Tag className="m-0">{formatTripType(trip.tripType, t)}</Tag>
            <StatusBadge
              label={formatBusinessTripStatus(trip.status, t)}
              variant={businessTripStatusVariant(trip.status)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex-1 min-w-0 rounded-md border border-[rgba(0,0,0,0.06)] bg-[var(--color-page-bg)] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
                From
              </p>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
                {originLabel}
              </h2>
            </div>
            <div className="hidden sm:flex items-center justify-center flex-shrink-0 px-1">
              <ArrowRight
                size={18}
                className="text-[var(--color-text-tertiary)]"
              />
            </div>
            <div className="flex-1 min-w-0 rounded-md border border-[rgba(0,0,0,0.06)] bg-[var(--color-page-bg)] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
                To
              </p>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
                {destinationLabel}
              </h2>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]">
            <span>
              Submitted by{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                {formatBusinessTripSubmitterName(trip.submitter)}
              </span>
            </span>
            <span className="text-[var(--color-border-secondary)]">路</span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar
                size={13}
                className="text-[var(--color-text-tertiary)]"
              />
              {formatProjectDate(trip.createdAt)}
            </span>
          </div>
        </div>

        <div className="border-t border-[rgba(0,0,0,0.06)]">
          <BusinessTripCurrentStepBanner trip={trip} embedded />
        </div>
      </div>

      {canAcknowledge && currentUserPassenger ? (
        <div className="rounded-none border border-[var(--color-amber-400)] bg-[var(--color-amber-50)] px-3 py-4 sm:px-5">
          <p className="text-sm font-semibold text-[var(--color-amber-400)] m-0 mb-1">
            Your ticket is ready 鈥?please acknowledge receipt
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] m-0 mb-3">
            Download your ticket below, then confirm you have received it.
          </p>

          {combinedTickets.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1.5">
                Combined Ticket
              </p>
              <AttachmentDownloadList documents={combinedTickets} />
            </div>
          ) : null}

          {passengerTickets.length > 0 ? (
            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1.5">
                Your Ticket
              </p>
              <AttachmentDownloadList documents={passengerTickets} />
            </div>
          ) : null}

          <Button
            type="primary"
            loading={acknowledgeTicket.isPending}
            onClick={() => void handleAcknowledge()}
          >
            Acknowledge Receipt
          </Button>
        </div>
      ) : null}

      <TripSummaryStrip
        departureDate={trip.departureDate}
        returnDate={trip.returnDate}
        passengerCount={trip.passengerCount}
        ticketClass={trip.ticketClass}
        estimatedTotalCost={trip.estimatedTotalCost}
      />

      {/* Travel Details */}
      <SectionCard title="Travel Details">
        <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
          <SubsectionHeader icon={<MapPin size={15} />} title="Route & Schedule" />
          <div className="rounded-md border border-[rgba(0,0,0,0.06)] bg-[var(--color-page-bg)] px-4 py-3 mb-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0">
                <p className="text-xs text-[var(--color-text-tertiary)] mb-0.5">
                  From
                </p>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
                  {originLabel}
                </p>
              </div>
              <ArrowRight
                size={16}
                className="text-[var(--color-text-tertiary)] flex-shrink-0 hidden sm:block"
              />
              <div className="min-w-0">
                <p className="text-xs text-[var(--color-text-tertiary)] mb-0.5">
                  To
                </p>
                <p className="text-sm font-semibold text-[var(--color-text-primary)] m-0">
                  {destinationLabel}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
            <MetaItem label="Departure">
              <span className="inline-flex items-center gap-1.5">
                <Calendar
                  size={13}
                  className="text-[var(--color-text-tertiary)]"
                />
                {formatProjectDate(trip.departureDate)}
              </span>
            </MetaItem>
            <MetaItem label="Return">
              {trip.returnDate ? (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar
                    size={13}
                    className="text-[var(--color-text-tertiary)]"
                  />
                  {formatProjectDate(trip.returnDate)}
                </span>
              ) : (
                '鈥?
              )}
            </MetaItem>
          </div>
        </div>

        <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
          <SubsectionHeader icon={<Plane size={15} />} title="Flight" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
            <MetaItem label="Trip Type">
              {formatTripType(trip.tripType, t)}
            </MetaItem>
            <MetaItem label="Ticket Class">
              {formatTicketClass(trip.ticketClass, t)}
            </MetaItem>
          </div>
        </div>

        <div className="px-3 py-4 sm:px-5">
          <SubsectionHeader
            icon={<BedDouble size={15} />}
            title="Stay & Allowances"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
            <MetaItem label="Accommodation">
              {trip.accommodationRequired ? (
                <div className="flex flex-col gap-1.5">
                  <Tag color="blue" className="w-fit m-0">
                    Required
                  </Tag>
                  {trip.accommodationDetails ? (
                    <span className="text-[var(--color-text-secondary)] leading-relaxed">
                      {trip.accommodationDetails}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="text-[var(--color-text-tertiary)]">
                  Not required
                </span>
              )}
            </MetaItem>
            <MetaItem label="Per Diem">
              {trip.perDiemRequired ? (
                <Tag color="blue" className="m-0 w-fit">
                  Required
                </Tag>
              ) : (
                <span className="text-[var(--color-text-tertiary)]">
                  Not required
                </span>
              )}
            </MetaItem>
          </div>
          {trip.notes ? (
            <div className="mt-4 ml-0 sm:ml-[23px]">
              <MetaItem label="Notes">
                <p className="whitespace-pre-wrap leading-relaxed m-0">
                  {trip.notes}
                </p>
              </MetaItem>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {/* Purpose & Host */}
      {hasPurposeContent ? (
        <SectionCard title="Purpose & Host">
          <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
            <SubsectionHeader icon={<FileText size={15} />} title="Purpose" />
            <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed m-0 ml-0 sm:ml-[23px]">
              {trip.purpose}
            </p>
          </div>

          {hasHost ? (
            <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
              <SubsectionHeader icon={<Building2 size={15} />} title="Host" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
                {trip.hostOrganization ? (
                  <MetaItem label="Organization">
                    {trip.hostOrganization}
                  </MetaItem>
                ) : null}
                {trip.hostContact ? (
                  <MetaItem label="Contact">{trip.hostContact}</MetaItem>
                ) : null}
              </div>
            </div>
          ) : null}

          {trip.expectedOutcomes ? (
            <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
              <SubsectionHeader
                icon={<Target size={15} />}
                title="Expected Outcomes"
              />
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed m-0 ml-0 sm:ml-[23px]">
                {trip.expectedOutcomes}
              </p>
            </div>
          ) : null}

          {trip.itinerary ? (
            <div className="px-3 py-4 sm:px-5">
              <SubsectionHeader
                icon={<Calendar size={15} />}
                title="Itinerary"
              />
              <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed m-0 ml-0 sm:ml-[23px]">
                {trip.itinerary}
              </p>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Budget */}
      <SectionCard title="Budget Estimate">
        <div className="divide-y divide-[rgba(0,0,0,0.06)]">
          {budgetRows.map(({ label, value }) => (
            <div
              key={label}
                  className="flex justify-between items-center px-3 py-2.5 sm:px-5 gap-3"
            >
              <span className="text-sm text-[var(--color-text-secondary)]">
                {label}
              </span>
              <span className="text-sm tabular-nums text-[var(--color-text-primary)]">
                {formatEtb(value)}
              </span>
            </div>
          ))}
          <div className="flex justify-between items-center px-3 py-3 sm:px-5 bg-[var(--color-surface-secondary)] gap-3">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Total
            </span>
            <span className="text-base font-bold tabular-nums text-[var(--color-text-primary)]">
              {formatEtb(trip.estimatedTotalCost)}
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Passengers */}
      <SectionCard
        title="Passengers"
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <Users size={12} />
              {trip.passengerCount}{' '}
              {trip.passengerCount === 1 ? 'person' : 'people'}
            </span>
            <span className="text-[var(--color-border-secondary)]">路</span>
            <span>
              {visaRequiredCount} visa
              {visaRequiredCount === 1 ? '' : 's'} required
            </span>
            <span className="text-[var(--color-border-secondary)]">路</span>
            <span>
              {ticketedCount}/{trip.passengers.length} ticketed
            </span>
          </div>
        }
      >
        <ul className="m-0 list-none p-0 divide-y divide-[rgba(0,0,0,0.06)]">
          {trip.passengers.map((row) => {
            const hasTicket = passengerHasTicket(
              row,
              trip.combinedTicketDocumentId,
            );
            const hasOwnTicket =
              Boolean(row.ticketDocumentId) ||
              (row.tickets?.length ?? 0) > 0;

            return (
              <li key={row.id} className="px-3 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)] m-0">
                      {row.employee
                        ? formatUserName(row.employee)
                        : row.employeeId}
                    </p>
                    {row.employee?.email ? (
                      <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 m-0">
                        {row.employee.email}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.visaRequired ? (
                      <Tag color="volcano" className="m-0">
                        {row.visaStatus
                          ? formatVisaStatus(row.visaStatus, t)
                          : 'Visa Required'}
                      </Tag>
                    ) : (
                      <Tag className="m-0">No Visa</Tag>
                    )}
                    {hasOwnTicket ? (
                      <Tag color="green" className="m-0">
                        Own Ticket
                      </Tag>
                    ) : hasTicket ? (
                      <Tag color="blue" className="m-0">
                        Combined Ticket
                      </Tag>
                    ) : (
                      <Tag className="m-0">No Ticket</Tag>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  <MetaItem label="Passport">
                    {row.passportNumber ?? (
                      <span className="text-[var(--color-text-tertiary)]">
                        Not provided
                      </span>
                    )}
                  </MetaItem>
                  <MetaItem label="Visa">
                    {row.visaRequired
                      ? row.visaStatus
                        ? formatVisaStatus(row.visaStatus, t)
                        : 'Required'
                      : 'Not required'}
                  </MetaItem>
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {showTicketPanel ? (
        <BusinessTripTicketAssignmentPanel trip={trip} />
      ) : null}

      {(trip.documents?.length ?? 0) > 0 ? (
        <SectionCard title="Supporting Attachments" bodyClassName="px-3 py-4 sm:px-5">
          <AttachmentDownloadList documents={trip.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
