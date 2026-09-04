'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import BusinessTripCurrentStepBanner from '@/components/modules/hr/business-trip/BusinessTripCurrentStepBanner';
import BusinessTripTicketAssignmentPanel from '@/components/modules/hr/business-trip/BusinessTripTicketAssignmentPanel';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageBusinessTrip,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
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
  tripTypeVariant,
} from '@/lib/utils/business-trip-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
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
 * Business trip detail — Users / employee profile chrome.
 */
export default function BusinessTripDetailPageContent({
  tripId,
}: {
  tripId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const canManage = useCanManageBusinessTrip();
  const canViewHr = useCanViewHr();

  const detailQuery = useBusinessTrip(tripId);
  const cancelMutation = useCancelBusinessTrip(tripId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useSetHeaderExtra(null);

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
      messageApi.success(t('hr.messages.businessTripCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelBusinessTrip'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-business-trip-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !trip) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.businessTripNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/business-trips')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const destinationLabel = trip.destinationCity
    ? `${trip.destinationCity}, ${trip.destinationCountry}`
    : trip.destinationCountry;
  const originLabel = `${trip.originCity}, ${trip.originCountry}`;
  const routeTitle = `${originLabel} → ${destinationLabel}`;
  const submitterName = formatBusinessTripSubmitterName(trip.submitter);
  const tripTypeLabel = formatTripType(trip.tripType, t);

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

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-business-trip-detail-page">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/business-trips')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {trip.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${trip.approvalRequestId}`)
                }
                aria-label={t('hr.buttons.viewInApprovals')}
              >
                {isNarrow
                  ? t('nav.approvals')
                  : t('hr.buttons.viewInApprovals')}
              </Button>
            ) : null}
            {canCancel ? (
              <Space.Compact>
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => setConfirmCancel(true)}
                  aria-label={t('hr.buttons.cancel')}
                >
                  {isNarrow ? undefined : t('hr.buttons.cancel')}
                </Button>
              </Space.Compact>
            ) : null}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">{trip.tripNumber}</span>
              <StatusBadge
                label={formatBusinessTripStatus(trip.status, t)}
                variant={businessTripStatusVariant(trip.status)}
              />
              <StatusBadge
                label={tripTypeLabel}
                variant={tripTypeVariant(trip.tripType)}
              />
              <span className="erp-users-role-tag">
                {t('hr.labels.international')}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {routeTitle}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {submitterName}
            </p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[
                `${t('hr.labels.departure')} ${formatProjectDate(trip.departureDate)}`,
                trip.returnDate
                  ? `${t('hr.labels.return')} ${formatProjectDate(trip.returnDate)}`
                  : tripTypeLabel,
                `${trip.passengerCount} ${t('hr.labels.passengers').toLowerCase()}`,
                formatEtb(trip.estimatedTotalCost),
              ].join(' · ')}
            </p>
          </div>
        </div>

        <div className="border-t border-[#eef1f4]">
          <BusinessTripCurrentStepBanner trip={trip} embedded />
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.departure')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(trip.departureDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.return')}</p>
            <p className="erp-employee-meta-value">
              {trip.returnDate ? formatProjectDate(trip.returnDate) : '—'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.passengers')}</p>
            <p className="erp-employee-meta-value">{trip.passengerCount}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.ticketClass')}</p>
            <p className="erp-employee-meta-value">
              {formatTicketClass(trip.ticketClass, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.labels.estimatedTotal')}
            </p>
            <p className="erp-employee-meta-value">
              {formatEtb(trip.estimatedTotalCost)}
            </p>
          </div>
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

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.labels.travelDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.form.origin')}>
                  <span className="erp-users-cell-strong">{originLabel}</span>
                </MetaItem>
                <MetaItem label={t('hr.form.destination')}>
                  <span className="erp-users-cell-strong">
                    {destinationLabel}
                  </span>
                </MetaItem>
                <MetaItem label={t('hr.labels.departure')}>
                  {formatProjectDate(trip.departureDate)}
                </MetaItem>
                <MetaItem label={t('hr.labels.return')}>
                  {trip.returnDate
                    ? formatProjectDate(trip.returnDate)
                    : '—'}
                </MetaItem>
                <MetaItem label={t('hr.labels.tripType')}>
                  <StatusBadge
                    label={tripTypeLabel}
                    variant={tripTypeVariant(trip.tripType)}
                  />
                </MetaItem>
                <MetaItem label={t('hr.labels.ticketClass')}>
                  {formatTicketClass(trip.ticketClass, t)}
                </MetaItem>
                <MetaItem label={t('hr.table.submittedBy')}>
                  {submitterName}
                </MetaItem>
                <MetaItem label={t('hr.labels.accommodation')}>
                  {trip.accommodationRequired ? (
                    <div className="flex flex-col items-start gap-1">
                      <span className="erp-users-role-tag">
                        {t('hr.labels.required')}
                      </span>
                      {trip.accommodationDetails ? (
                        <span className="erp-users-cell-sub">
                          {trip.accommodationDetails}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="erp-users-cell-sub">
                      {t('hr.labels.notRequired')}
                    </span>
                  )}
                </MetaItem>
                <MetaItem label={t('hr.labels.perDiem')}>
                  {trip.perDiemRequired ? (
                    <span className="erp-users-role-tag">
                      {t('hr.labels.required')}
                    </span>
                  ) : (
                    <span className="erp-users-cell-sub">
                      {t('hr.labels.notRequired')}
                    </span>
                  )}
                </MetaItem>
                {trip.notes?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.notes')}>
                      <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                        {trip.notes}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            {hasPurposeContent ? (
              <DetailSection title={t('hr.labels.purposeHost')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {trip.purpose ? (
                    <div className="md:col-span-2">
                      <MetaItem label={t('hr.labels.purpose')}>
                        <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                          {trip.purpose}
                        </p>
                      </MetaItem>
                    </div>
                  ) : null}
                  {trip.hostOrganization ? (
                    <MetaItem label={t('hr.labels.organization')}>
                      {trip.hostOrganization}
                    </MetaItem>
                  ) : null}
                  {trip.hostContact ? (
                    <MetaItem label={t('hr.labels.contact')}>
                      {trip.hostContact}
                    </MetaItem>
                  ) : null}
                  {trip.expectedOutcomes ? (
                    <div className="md:col-span-2">
                      <MetaItem label={t('hr.labels.expectedOutcomes')}>
                        <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                          {trip.expectedOutcomes}
                        </p>
                      </MetaItem>
                    </div>
                  ) : null}
                  {trip.itinerary ? (
                    <div className="md:col-span-2">
                      <MetaItem label={t('hr.labels.itinerary')}>
                        <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                          {trip.itinerary}
                        </p>
                      </MetaItem>
                    </div>
                  ) : null}
                </div>
              </DetailSection>
            ) : null}

            <DetailSection
              title={t('hr.section.passengerDetails')}
              bodyClassName="!p-0"
              action={
                <span className="erp-users-cell-sub text-xs">
                  {[
                    `${trip.passengerCount}`,
                    `${visaRequiredCount} ${t('hr.form.visaRequired').toLowerCase()}`,
                    `${ticketedCount}/${trip.passengers.length} ${t('hr.table.ticket').toLowerCase()}`,
                  ].join(' · ')}
                </span>
              }
            >
              <ul className="m-0 list-none divide-y divide-[#eef1f4] p-0">
                {trip.passengers.map((row) => {
                  const hasTicket = passengerHasTicket(
                    row,
                    trip.combinedTicketDocumentId,
                  );
                  const hasOwnTicket =
                    Boolean(row.ticketDocumentId) ||
                    (row.tickets?.length ?? 0) > 0;

                  return (
                    <li key={row.id} className="px-3 py-4 sm:px-4">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="erp-users-cell-strong m-0">
                            {row.employee
                              ? formatUserName(row.employee)
                              : row.employeeId}
                          </p>
                          {row.employee?.email ? (
                            <p className="erp-users-email m-0 mt-0.5">
                              {row.employee.email}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.visaRequired ? (
                            <span className="erp-users-role-tag">
                              {row.visaStatus
                                ? formatVisaStatus(row.visaStatus, t)
                                : t('hr.form.visaRequired')}
                            </span>
                          ) : (
                            <span className="erp-users-role-tag">
                              {t('hr.labels.notRequired')}
                            </span>
                          )}
                          {hasOwnTicket ? (
                            <StatusBadge
                              label={t('hr.table.ticket')}
                              variant="success"
                            />
                          ) : hasTicket ? (
                            <StatusBadge
                              label={t('hr.labels.combinedTicket')}
                              variant="info"
                            />
                          ) : (
                            <StatusBadge
                              label={t('hr.labels.noTicket')}
                              variant="default"
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <MetaItem label={t('hr.labels.passport')}>
                          {row.passportNumber ?? (
                            <span className="erp-users-cell-sub">—</span>
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
            </DetailSection>

            {showTicketPanel ? (
              <BusinessTripTicketAssignmentPanel trip={trip} />
            ) : null}

            <DetailSection title={t('hr.section.supportingDocuments')}>
              {trip.documents.length > 0 ? (
                <AttachmentDownloadList documents={trip.documents} />
              ) : (
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noAttachments')}
                </p>
              )}
            </DetailSection>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          <div className="erp-pro-card overflow-hidden">
            <DetailSection
              title={t('hr.labels.budgetEstimate')}
              bodyClassName="!p-0"
            >
              <div className="divide-y divide-[#eef1f4]">
                {budgetRows.map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4"
                  >
                    <span className="erp-users-cell-sub text-sm">{label}</span>
                    <span className="erp-users-cell-strong tabular-nums text-sm">
                      {formatEtb(value)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 bg-[var(--color-surface-secondary)] px-3 py-3 sm:px-4">
                  <span className="erp-users-cell-strong text-sm">
                    {t('hr.labels.estimatedTotal')}
                  </span>
                  <span className="erp-employee-meta-value tabular-nums">
                    {formatEtb(trip.estimatedTotalCost)}
                  </span>
                </div>
              </div>
            </DetailSection>
          </div>

          {trip.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={trip.approvalRequest.currentTier ?? 0}
            />
          ) : (
            <div className="erp-pro-card">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelBusinessTripTitle')}
        description={t('hr.dialog.cancelBusinessTripDesc')}
        confirmLabel={t('hr.labels.cancelTripConfirm')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
