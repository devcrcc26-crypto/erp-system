'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Skeleton, Tag } from 'antd';
import {
  ArrowLeft,
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
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageBusinessTrip,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { ApiRequestError } from '@/lib/api/errors';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import type { BusinessTripPassenger } from '@/lib/api/business-trip.types';
import {
  useBusinessTrip,
  useCancelBusinessTrip,
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
    <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between gap-3">
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
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
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
      {description ? (
        <p className="text-xs text-[var(--color-text-tertiary)] ml-[23px] m-0">
          {description}
        </p>
      ) : null}
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
    {
      label: t('hr.labels.departure'),
      value: formatProjectDate(departureDate),
    },
    {
      label: t('hr.labels.return'),
      value: returnDate ? formatProjectDate(returnDate) : t('hr.tripType.ONE_WAY'),
    },
    {
      label: t('hr.labels.passengers'),
      value: String(passengerCount),
    },
    {
      label: t('hr.labels.ticketClass'),
      value: formatTicketClass(ticketClass, t),
    },
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
          className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] px-4 py-3"
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
 * Business trip detail with passengers, tickets, budget, and approval timeline.
 */
export default function BusinessTripDetailPageContent({
  tripId,
}: {
  tripId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const canManage = useCanManageBusinessTrip();
  const canViewHr = useCanViewHr();

  const detailQuery = useBusinessTrip(tripId);
  const cancelMutation = useCancelBusinessTrip(tripId);

  const [confirmCancel, setConfirmCancel] = useState(false);

  const trip = detailQuery.data;

  const tiers = useMemo(
    () => (trip?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [trip?.approvalRequest?.tiers],
  );

  const canCancel =
    Boolean(trip) &&
    Boolean(currentUser.data?.id) &&
    trip?.submittedBy === currentUser.data?.id &&
    (trip?.status === 'DRAFT' || trip?.status === 'SUBMITTED');

  const showTicketPanel =
    trip?.status === 'APPROVED' ||
    Boolean(trip?.combinedTicketDocumentId) ||
    (trip?.passengers.some((p) => p.ticketDocumentId) ?? false);

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Business trip cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel business trip', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 10 }} />;
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
        action={
          <Button onClick={() => router.push('/hr/business-trips')}>
            Back to list
          </Button>
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
    { label: t('hr.labels.estimatedFlight'), value: trip.estimatedFlightCost },
    {
      label: t('hr.labels.estimatedAccommodation'),
      value: trip.estimatedAccommodationCost,
    },
    { label: t('hr.labels.estimatedPerDiem'), value: trip.estimatedPerDiem },
    { label: t('hr.labels.estimatedOther'), value: trip.estimatedOtherCost },
  ];

  const hasPurposeContent =
    Boolean(trip.purpose) ||
    Boolean(trip.hostOrganization) ||
    Boolean(trip.hostContact) ||
    Boolean(trip.expectedOutcomes) ||
    Boolean(trip.itinerary);

  const hasHost =
    Boolean(trip.hostOrganization) || Boolean(trip.hostContact);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => router.push('/hr/business-trips')}
        className="flex items-center gap-1.5 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] self-start transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Business Trips</span>
      </button>

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                {trip.tripNumber}
              </span>
              <span className="text-[var(--color-border-secondary)]">·</span>
              <Tag className="m-0">{formatTripType(trip.tripType, t)}</Tag>
              <StatusBadge
                label={formatBusinessTripStatus(trip.status, t)}
                variant={businessTripStatusVariant(trip.status)}
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {trip.approvalRequestId ? (
                <Button
                  size="small"
                  onClick={() =>
                    router.push(`/approvals/${trip.approvalRequestId}`)
                  }
                >
                  {t('hr.buttons.viewInApprovals')}
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  danger
                  size="small"
                  onClick={() => setConfirmCancel(true)}
                >
                  {t('hr.buttons.cancel')}
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
              {t('hr.table.submittedBy')}{' '}
              <span className="font-medium text-[var(--color-text-primary)]">
                {formatBusinessTripSubmitterName(trip.submitter)}
              </span>
            </span>
            <span className="text-[var(--color-border-secondary)]">·</span>
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

      {trip.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      trip.needsTicketAttachment ? (
        <Alert
          type="info"
          showIcon
          title={t('hr.labels.ticketsRequired')}
          description={t('hr.labels.ticketsRequiredDesc')}
        />
      ) : null}

      <TripSummaryStrip
        departureDate={trip.departureDate}
        returnDate={trip.returnDate}
        passengerCount={trip.passengerCount}
        ticketClass={trip.ticketClass}
        estimatedTotalCost={trip.estimatedTotalCost}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Travel Details */}
          <SectionCard title={t('hr.labels.travelDetails')}>
            <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
              <SubsectionHeader
                icon={<MapPin size={15} />}
                title={t('hr.labels.routeSchedule')}
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
                <MetaItem label={t('hr.labels.departure')}>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar
                      size={13}
                      className="text-[var(--color-text-tertiary)]"
                    />
                    {formatProjectDate(trip.departureDate)}
                  </span>
                </MetaItem>
                <MetaItem label={t('hr.labels.return')}>
                  {trip.returnDate ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar
                        size={13}
                        className="text-[var(--color-text-tertiary)]"
                      />
                      {formatProjectDate(trip.returnDate)}
                    </span>
                  ) : (
                    '—'
                  )}
                </MetaItem>
              </div>
            </div>

            <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
              <SubsectionHeader icon={<Plane size={15} />} title={t('hr.labels.flight')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
                <MetaItem label={t('hr.labels.tripType')}>
                  {formatTripType(trip.tripType, t)}
                </MetaItem>
                <MetaItem label={t('hr.labels.ticketClass')}>
                  {formatTicketClass(trip.ticketClass, t)}
                </MetaItem>
              </div>
            </div>

            <div className="px-5 py-4">
              <SubsectionHeader
                icon={<BedDouble size={15} />}
                title={t('hr.labels.stayAllowances')}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
                <MetaItem label={t('hr.labels.accommodation')}>
                  {trip.accommodationRequired ? (
                    <div className="flex flex-col gap-1.5">
                      <Tag color="blue" className="w-fit m-0">
                        {t('hr.labels.required')}
                      </Tag>
                      {trip.accommodationDetails ? (
                        <span className="text-[var(--color-text-secondary)] leading-relaxed">
                          {trip.accommodationDetails}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[var(--color-text-tertiary)]">
                      {t('hr.labels.notRequired')}
                    </span>
                  )}
                </MetaItem>
                <MetaItem label={t('hr.labels.perDiem')}>
                  {trip.perDiemRequired ? (
                    <Tag color="blue" className="m-0 w-fit">
                      {t('hr.labels.required')}
                    </Tag>
                  ) : (
                    <span className="text-[var(--color-text-tertiary)]">
                      {t('hr.labels.notRequired')}
                    </span>
                  )}
                </MetaItem>
              </div>
              {trip.notes ? (
                <div className="mt-4 ml-0 sm:ml-[23px]">
                  <MetaItem label={t('hr.labels.notes')}>
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
            <SectionCard title={t('hr.labels.purposeHost')}>
              <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
                <SubsectionHeader
                  icon={<FileText size={15} />}
                  title={t('hr.labels.purpose')}
                />
                <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed m-0 ml-0 sm:ml-[23px]">
                  {trip.purpose}
                </p>
              </div>

              {hasHost ? (
                <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
                  <SubsectionHeader
                    icon={<Building2 size={15} />}
                    title={t('hr.labels.host')}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 ml-0 sm:ml-[23px]">
                    {trip.hostOrganization ? (
                      <MetaItem label={t('hr.labels.organization')}>
                        {trip.hostOrganization}
                      </MetaItem>
                    ) : null}
                    {trip.hostContact ? (
                      <MetaItem label={t('hr.labels.contact')}>{trip.hostContact}</MetaItem>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {trip.expectedOutcomes ? (
                <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] last:border-b-0">
                  <SubsectionHeader
                    icon={<Target size={15} />}
                    title={t('hr.labels.expectedOutcomes')}
                  />
                  <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed m-0 ml-0 sm:ml-[23px]">
                    {trip.expectedOutcomes}
                  </p>
                </div>
              ) : null}

              {trip.itinerary ? (
                <div className="px-5 py-4">
                  <SubsectionHeader
                    icon={<Calendar size={15} />}
                    title={t('hr.labels.itinerary')}
                  />
                  <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed m-0 ml-0 sm:ml-[23px]">
                    {trip.itinerary}
                  </p>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {/* Passengers */}
          <SectionCard
            title={t('hr.labels.passengers')}
            action={
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                <span className="inline-flex items-center gap-1">
                  <Users size={12} />
                  {trip.passengerCount}{' '}
                  {trip.passengerCount === 1 ? 'person' : 'people'}
                </span>
                <span className="text-[var(--color-border-secondary)]">·</span>
                <span>
                  {visaRequiredCount} visa
                  {visaRequiredCount === 1 ? '' : 's'} required
                </span>
                <span className="text-[var(--color-border-secondary)]">·</span>
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
                              ? formatVisaStatus(row.visaStatus, t)
                              : t('hr.form.visaRequired')}
                          </Tag>
                        ) : (
                          <Tag className="m-0">{t('hr.labels.notRequired')}</Tag>
                        )}
                        {hasOwnTicket ? (
                          <Tag color="green" className="m-0">
                            {t('hr.table.ticket')}
                          </Tag>
                        ) : hasTicket ? (
                          <Tag color="blue" className="m-0">
                            {t('hr.labels.combinedTicket')}
                          </Tag>
                        ) : (
                          <Tag className="m-0">{t('hr.labels.noTicket')}</Tag>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                      <MetaItem label={t('hr.labels.passport')}>
                        {row.passportNumber ?? (
                          <span className="text-[var(--color-text-tertiary)]">
                            —
                          </span>
                        )}
                      </MetaItem>
                      <MetaItem label={t('hr.labels.visa')}>
                        {row.visaRequired
                          ? row.visaStatus
                            ? formatVisaStatus(row.visaStatus, t)
                            : t('hr.labels.required')
                          : t('hr.labels.notRequired')}
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

          <SectionCard
            title={t('hr.labels.supportingAttachments')}
            bodyClassName="px-5 py-4"
          >
            {trip.documents.length > 0 ? (
              <AttachmentDownloadList documents={trip.documents} />
            ) : (
              <p className="text-sm text-[var(--color-text-tertiary)] m-0">
                {t('hr.empty.noAttachments')}
              </p>
            )}
          </SectionCard>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <SectionCard title={t('hr.labels.budgetEstimate')}>
            <div className="divide-y divide-[rgba(0,0,0,0.06)]">
              {budgetRows.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between items-center px-5 py-2.5 gap-3"
                >
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {label}
                  </span>
                  <span className="text-sm tabular-nums text-[var(--color-text-primary)]">
                    {formatEtb(value)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center px-5 py-3 bg-[var(--color-surface-secondary)] gap-3">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('hr.labels.estimatedTotal')}
                </span>
                <span className="text-base font-bold tabular-nums text-[var(--color-text-primary)]">
                  {formatEtb(trip.estimatedTotalCost)}
                </span>
              </div>
            </div>
          </SectionCard>

          {trip.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={trip.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <SectionCard title={t('hr.labels.approvalChain')} bodyClassName="px-5 py-4">
              <p className="text-sm text-[var(--color-text-tertiary)] m-0">
                {t('hr.empty.noApprovalChain')}
              </p>
            </SectionCard>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.labels.cancelTrip')}
        description={t('hr.labels.cancelTripDesc')}
        confirmLabel={t('hr.labels.cancelTripConfirm')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
