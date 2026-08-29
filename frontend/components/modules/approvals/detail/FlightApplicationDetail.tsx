'use client';

import { Alert, Button, Skeleton, Tag } from 'antd';
import {
  ArrowRight,
  BedDouble,
  Calendar,
  FileText,
  MapPin,
  Plane,
  Users,
} from 'lucide-react';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import FlightTicketAssignmentPanel from '@/components/modules/hr/flight/FlightTicketAssignmentPanel';
import {
  MetaItem,
  SectionCard,
  SubsectionHeader,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { FlightPassenger } from '@/lib/api/flight.types';
import {
  useAcknowledgeTicket,
  useFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
} from '@/lib/utils/flight-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

function passengerHasTicket(
  row: FlightPassenger,
  combinedTicketDocumentId?: string | null,
): boolean {
  return (
    Boolean(row.ticketDocumentId) ||
    (row.tickets?.length ?? 0) > 0 ||
    Boolean(combinedTicketDocumentId)
  );
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
      messageApi.success('Ticket acknowledged');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to acknowledge ticket', messageApi);
    }
  }

  if (detailQuery.isLoading && !application) {
    return (
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Flight application not found'
        }
      />
    );
  }

  const originLabel = `${application.originCity}, ${application.originCountry}`;
  const destinationLabel = application.destination;

  const visaRequiredCount = application.passengers.filter(
    (p) => p.visaRequired,
  ).length;
  const ticketedCount = application.passengers.filter((p) =>
    passengerHasTicket(p, application.combinedTicketDocumentId),
  ).length;

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
      {/* Route + step (approval page already shows request title/status) */}
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-3 py-4 sm:px-5">
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
          {application.isInternational ? (
            <div className="mt-3">
              <Tag color="volcano" className="m-0">
                International
              </Tag>
            </div>
          ) : null}
        </div>

        <div className="border-t border-[rgba(0,0,0,0.06)]">
          <FlightCurrentStepBanner application={application} embedded />
        </div>
      </div>

      {canAcknowledge && currentUserPassenger ? (
        <div className="rounded-none border border-[var(--color-amber-400)] bg-[var(--color-amber-50)] px-3 py-4 sm:px-5">
          <p className="text-sm font-semibold text-[var(--color-amber-400)] m-0 mb-1">
            Your ticket is ready  - please acknowledge receipt
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

      <SummaryStrip
        items={[
          {
            label: 'Departure',
            value: formatProjectDate(application.departureDate),
          },
          {
            label: 'Return',
            value: application.returnDate
              ? formatProjectDate(application.returnDate)
              : 'One way',
          },
          {
            label: 'Passengers',
            value: String(application.passengerCount),
          },
          {
            label: 'Class',
            value: formatTicketClass(application.ticketClass, t),
          },
        ]}
      />

      <SectionCard title="Travel Details">
        <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
          <SubsectionHeader
            icon={<MapPin size={15} />}
            title="Route & Schedule"
          />
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
                {formatProjectDate(application.departureDate)}
              </span>
            </MetaItem>
            <MetaItem label="Return">
              {application.returnDate ? (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar
                    size={13}
                    className="text-[var(--color-text-tertiary)]"
                  />
                  {formatProjectDate(application.returnDate)}
                </span>
              ) : (
                '-'
              )}
            </MetaItem>
          </div>
        </div>

        <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
          <SubsectionHeader icon={<Plane size={15} />} title="Flight" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
            <MetaItem label="Trip Type">
              {formatTripType(application.tripType, t)}
            </MetaItem>
            <MetaItem label="Ticket Class">
              {formatTicketClass(application.ticketClass, t)}
            </MetaItem>
          </div>
        </div>

        <div className="px-3 py-4 sm:px-5 border-b border-[rgba(0,0,0,0.06)]">
          <SubsectionHeader
            icon={<BedDouble size={15} />}
            title="Stay & Allowances"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
            <MetaItem label="Accommodation">
              {application.accommodationRequired ? (
                <div className="flex flex-col gap-1.5">
                  <Tag color="blue" className="w-fit m-0">
                    Required
                  </Tag>
                  {application.accommodationDetails ? (
                    <span className="text-[var(--color-text-secondary)] leading-relaxed">
                      {application.accommodationDetails}
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
              {application.perDiemRequired ? (
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
        </div>

        <div className="px-3 py-4 sm:px-5">
          <SubsectionHeader
            icon={<FileText size={15} />}
            title="Purpose & Notes"
          />
          <div className="ml-0 sm:ml-[23px] flex flex-col gap-3">
            <MetaItem label="Purpose">
              <p className="whitespace-pre-wrap leading-relaxed m-0">
                {application.purpose}
              </p>
            </MetaItem>
            {application.notes ? (
              <MetaItem label="Notes">
                <p className="whitespace-pre-wrap leading-relaxed m-0">
                  {application.notes}
                </p>
              </MetaItem>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Passengers"
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <Users size={12} />
              {application.passengerCount}{' '}
              {application.passengerCount === 1 ? 'person' : 'people'}
            </span>
            <span className="text-[var(--color-border-secondary)]">·</span>
            <span>
              {visaRequiredCount} visa
              {visaRequiredCount === 1 ? '' : 's'} required
            </span>
            <span className="text-[var(--color-border-secondary)]">·</span>
            <span>
              {ticketedCount}/{application.passengers.length} ticketed
            </span>
          </div>
        }
      >
        <ul className="m-0 list-none p-0 divide-y divide-[rgba(0,0,0,0.06)]">
          {application.passengers.map((row) => {
            const hasTicket = passengerHasTicket(
              row,
              application.combinedTicketDocumentId,
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
        <FlightTicketAssignmentPanel application={application} />
      ) : null}

      {(application.documents?.length ?? 0) > 0 ? (
        <SectionCard title="Supporting Attachments" bodyClassName="px-3 py-4 sm:px-5">
          <AttachmentDownloadList documents={application.documents} />
        </SectionCard>
      ) : null}
    </div>
  );
}
