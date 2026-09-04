'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import FlightCurrentStepBanner from '@/components/modules/hr/flight/FlightCurrentStepBanner';
import FlightTicketAssignmentPanel from '@/components/modules/hr/flight/FlightTicketAssignmentPanel';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanManageFlight,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
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
  tripTypeVariant,
} from '@/lib/utils/flight-display';
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
 * Flight application detail — Users / employee profile chrome.
 */
export default function FlightApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const canManage = useCanManageFlight();
  const canViewHr = useCanViewHr();

  const detailQuery = useFlightApplication(applicationId);
  const cancelMutation = useCancelFlightApplication(applicationId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useSetHeaderExtra(null);

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
      messageApi.success(t('hr.messages.flightApplicationCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelFlightApplication'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-flight-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.flightApplicationNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/flight-applications')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const originLabel = `${application.originCity}, ${application.originCountry}`;
  const destinationLabel = application.destination;
  const routeTitle = `${originLabel} → ${destinationLabel}`;
  const submitterName = formatFlightSubmitterName(application.submitter);
  const tripTypeLabel = formatTripType(application.tripType, t);

  const visaRequiredCount = application.passengers.filter(
    (p) => p.visaRequired,
  ).length;
  const ticketedCount = application.passengers.filter((p) =>
    passengerHasTicket(p, application.combinedTicketDocumentId),
  ).length;

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-flight-detail-page">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/flight-applications')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {application.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${application.approvalRequestId}`)
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
              <span className="erp-users-id-chip">
                {application.applicationNumber}
              </span>
              <StatusBadge
                label={formatFlightStatus(application.status, t)}
                variant={flightStatusVariant(application.status)}
              />
              <StatusBadge
                label={tripTypeLabel}
                variant={tripTypeVariant(application.tripType)}
              />
              {application.isInternational ? (
                <span className="erp-users-role-tag">
                  {t('hr.labels.international')}
                </span>
              ) : (
                <span className="erp-users-role-tag">
                  {t('hr.labels.domestic')}
                </span>
              )}
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
                `${t('hr.labels.departure')} ${formatProjectDate(application.departureDate)}`,
                application.returnDate
                  ? `${t('hr.labels.return')} ${formatProjectDate(application.returnDate)}`
                  : tripTypeLabel,
                `${application.passengerCount} ${t('hr.labels.passengers').toLowerCase()}`,
              ].join(' · ')}
            </p>
          </div>
        </div>

        <div className="border-t border-[#eef1f4]">
          <FlightCurrentStepBanner application={application} embedded />
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.departure')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(application.departureDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.return')}</p>
            <p className="erp-employee-meta-value">
              {application.returnDate
                ? formatProjectDate(application.returnDate)
                : '—'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.passengers')}</p>
            <p className="erp-employee-meta-value">
              {application.passengerCount}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.ticketClass')}</p>
            <p className="erp-employee-meta-value">
              {formatTicketClass(application.ticketClass, t)}
            </p>
          </div>
        </div>
      </div>

      {application.status === 'APPROVED' &&
      (canViewHr || canManage) &&
      application.needsTicketAttachment ? (
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
                  {formatProjectDate(application.departureDate)}
                </MetaItem>
                <MetaItem label={t('hr.labels.return')}>
                  {application.returnDate
                    ? formatProjectDate(application.returnDate)
                    : '—'}
                </MetaItem>
                <MetaItem label={t('hr.labels.tripType')}>
                  <StatusBadge
                    label={tripTypeLabel}
                    variant={tripTypeVariant(application.tripType)}
                  />
                </MetaItem>
                <MetaItem label={t('hr.labels.ticketClass')}>
                  {formatTicketClass(application.ticketClass, t)}
                </MetaItem>
                <MetaItem label={t('hr.labels.international')}>
                  <span className="erp-users-role-tag">
                    {application.isInternational
                      ? t('hr.labels.international')
                      : t('hr.labels.domestic')}
                  </span>
                </MetaItem>
                <MetaItem label={t('hr.table.submittedBy')}>
                  {submitterName}
                </MetaItem>
                <MetaItem label={t('hr.labels.accommodation')}>
                  {application.accommodationRequired ? (
                    <div className="flex flex-col gap-1">
                      <span className="erp-users-role-tag">
                        {t('hr.labels.required')}
                      </span>
                      {application.accommodationDetails ? (
                        <span className="erp-users-cell-sub">
                          {application.accommodationDetails}
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
                  {application.perDiemRequired ? (
                    <span className="erp-users-role-tag">
                      {t('hr.labels.required')}
                    </span>
                  ) : (
                    <span className="erp-users-cell-sub">
                      {t('hr.labels.notRequired')}
                    </span>
                  )}
                </MetaItem>
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.labels.purpose')}>
                    <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                      {application.purpose}
                    </p>
                  </MetaItem>
                </div>
                {application.notes?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.notes')}>
                      <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                        {application.notes}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            <DetailSection
              title={t('hr.section.passengerDetails')}
              bodyClassName="!p-0"
              action={
                <span className="erp-users-cell-sub text-xs">
                  {[
                    `${application.passengerCount}`,
                    `${visaRequiredCount} ${t('hr.form.visaRequired').toLowerCase()}`,
                    `${ticketedCount}/${application.passengers.length} ${t('hr.table.ticket').toLowerCase()}`,
                  ].join(' · ')}
                </span>
              }
            >
              <ul className="m-0 list-none divide-y divide-[#eef1f4] p-0">
                {application.passengers.map((row) => {
                  const hasTicket = passengerHasTicket(
                    row,
                    application.combinedTicketDocumentId,
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
              <FlightTicketAssignmentPanel application={application} />
            ) : null}

            <DetailSection title={t('hr.section.supportingDocuments')}>
              {application.documents.length > 0 ? (
                <AttachmentDownloadList documents={application.documents} />
              ) : (
                <p className="erp-users-cell-sub m-0">
                  {t('hr.empty.noAttachments')}
                </p>
              )}
            </DetailSection>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          {application.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={application.approvalRequest.currentTier ?? 0}
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
        title={t('hr.dialog.cancelFlightApplicationTitle')}
        description={t('hr.dialog.cancelFlightApplicationDesc')}
        confirmLabel={t('hr.buttons.cancel')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
