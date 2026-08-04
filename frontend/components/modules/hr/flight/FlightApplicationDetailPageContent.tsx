'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Skeleton, Tag } from 'antd';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Calendar,
  FileText,
  MapPin,
  Plane,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import FlightTicketAssignmentPanel from '@/components/modules/hr/flight/FlightTicketAssignmentPanel';
import {
  MetaItem,
  SectionCard,
  SubsectionHeader,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageFlight,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { FlightPassenger } from '@/lib/api/flight.types';
import {
  useCancelFlightApplication,
  useFlightApplication,
} from '@/lib/query/flight';
import { useCurrentUser } from '@/lib/query/profile';
import {
  flightStatusVariant,
  formatFlightStatus,
  formatFlightSubmitterName,
  formatTicketClass,
  formatTripType,
  formatVisaStatus,
} from '@/lib/utils/flight-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

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
 * Flight application detail with passengers, tickets, and approval timeline.
 */
export default function FlightApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const canManage = useCanManageFlight();
  const canViewHr = useCanViewHr();

  const detailQuery = useFlightApplication(applicationId);
  const cancelMutation = useCancelFlightApplication(applicationId);

  const [confirmCancel, setConfirmCancel] = useState(false);

  const application = detailQuery.data;

  const tiers = useMemo(
    () => (application?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [application?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(application) &&
    Boolean(currentUser.data?.id) &&
    application?.submittedBy === currentUser.data?.id &&
    (application?.status === 'DRAFT' || application?.status === 'SUBMITTED');

  const showTicketPanel =
    application?.status === 'APPROVED' ||
    Boolean(application?.combinedTicketDocumentId) ||
    (application?.passengers.some((p) => p.ticketDocumentId) ?? false);

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Flight application cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel flight application', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
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
        action={
          <Button onClick={() => router.push('/hr/flight-applications')}>
            Back to list
          </Button>
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

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push('/hr/flight-applications')}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] self-start transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Flight Applications</span>
      </button>

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {application.applicationNumber}
              </span>
              <span className="text-[var(--color-border-secondary)]">·</span>
              <Tag className="m-0">{formatTripType(application.tripType)}</Tag>
              <StatusBadge
                label={formatFlightStatus(application.status)}
                variant={flightStatusVariant(application.status)}
              />
              {application.isInternational ? (
                <Tag color="volcano" className="m-0">
                  International
                </Tag>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {application.approvalRequestId ? (
                <Button
                  size="small"
                  onClick={() =>
                    router.push(`/approvals/${application.approvalRequestId}`)
                  }
                >
                  View in Approvals
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  danger
                  size="small"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex-1 min-w-0 rounded-md border border-[rgba(0,0,0,0.06)] bg-[var(--color-page-bg)] px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
                From
              </p>
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
                {originLabel}
              </h1>
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
                {formatFlightSubmitterName(application.submitter)}
              </span>
            </span>
            <span className="text-[var(--color-border-secondary)]">·</span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar
                size={13}
                className="text-[var(--color-text-tertiary)]"
              />
              {formatProjectDate(application.createdAt)}
            </span>
          </div>
        </div>

        <div className="border-t border-[rgba(0,0,0,0.06)]">
          <FlightCurrentStepBanner application={application} embedded />
        </div>
      </div>

      {application.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      application.needsTicketAttachment ? (
        <Alert
          type="info"
          showIcon
          message="Tickets required"
          description="The application is approved. Upload a combined ticket and/or individual passenger tickets below."
        />
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
            value: formatTicketClass(application.ticketClass),
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <SectionCard title="Travel Details">
            <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
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
                    '—'
                  )}
                </MetaItem>
              </div>
            </div>

            <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
              <SubsectionHeader icon={<Plane size={15} />} title="Flight" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
                <MetaItem label="Trip Type">
                  {formatTripType(application.tripType)}
                </MetaItem>
                <MetaItem label="Ticket Class">
                  {formatTicketClass(application.ticketClass)}
                </MetaItem>
                <MetaItem label="International">
                  {application.isInternational ? (
                    <Tag color="volcano" className="m-0 w-fit">
                      International
                    </Tag>
                  ) : (
                    <Tag className="m-0 w-fit">Domestic</Tag>
                  )}
                </MetaItem>
              </div>
            </div>

            <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
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

            <div className="px-5 py-4">
              <SubsectionHeader
                icon={<FileText size={15} />}
                title="Purpose & Notes"
              />
              <div className="ml-0 sm:ml-[23px] flex flex-col gap-4">
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
                  <li key={row.id} className="px-5 py-4">
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
                              ? formatVisaStatus(row.visaStatus)
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
                            ? formatVisaStatus(row.visaStatus)
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

          <SectionCard
            title="Supporting Attachments"
            bodyClassName="px-5 py-4"
          >
            {application.documents.length > 0 ? (
              <AttachmentDownloadList documents={application.documents} />
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)] m-0">
                No supporting documents attached.
              </p>
            )}
          </SectionCard>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          {application.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={application.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <SectionCard title="Approval Chain" bodyClassName="px-5 py-4">
              <p className="text-sm text-[var(--color-text-tertiary)] m-0">
                No approval workflow linked.
              </p>
            </SectionCard>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel flight application?"
        description="This will cancel the flight application. This cannot be undone."
        confirmLabel="Cancel application"
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
