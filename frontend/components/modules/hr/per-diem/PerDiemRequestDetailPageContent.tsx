'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Grid, Skeleton, Space } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCancelPerDiemRequest,
  usePerDiemRequest,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatCurrencyAmount,
  formatEtbAmount,
} from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className={`erp-employee-section ${className}`.trim()}>
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

/**
 * Per diem request detail — Users / employee profile chrome.
 */
export default function PerDiemRequestDetailPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const detailQuery = usePerDiemRequest(requestId);
  const cancelMutation = useCancelPerDiemRequest(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isOwner =
    Boolean(request) && request?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.perDiemRequestCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToCancelPerDiemRequest'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-per-diem-detail-page">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-detail-page">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.perDiemRequestNotFound')
          }
          action={
            <Button onClick={() => router.push('/hr/per-diem')}>
              {t('hr.buttons.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatPerDiemEmployeeName(request.employee);
  const linkedTravel = request.linkedFlight
    ? `${t('hr.labels.flight')} ${request.linkedFlight.applicationNumber} · ${request.linkedFlight.destination}`
    : request.linkedTrip
      ? `${t('pages.hr.businessTrip.detail')} ${request.linkedTrip.tripNumber} · ${request.linkedTrip.destinationCity}, ${request.linkedTrip.destinationCountry}`
      : null;

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page erp-per-diem-detail-page">
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/per-diem')}
              aria-label={t('hr.buttons.backToList')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            {request.approvalRequestId ? (
              <Button
                onClick={() =>
                  router.push(`/approvals/${request.approvalRequestId}`)
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
              <span className="erp-users-id-chip">{request.requestNumber}</span>
              <StatusBadge
                label={formatPerDiemStatus(request.status, t)}
                variant={perDiemStatusVariant(request.status)}
              />
              <span className="erp-users-role-tag">
                {request.destinationCategory}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {request.destination}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
            </p>
            <p className="erp-users-cell-sub m-0 mt-1">
              {[
                `${formatProjectDate(request.startDate)} – ${formatProjectDate(request.endDate)}`,
                `${request.days} ${t('hr.labels.days').toLowerCase()}`,
                formatEtbAmount(request.totalAmountEtb),
              ].join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.startDate')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(request.startDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.endDate')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(request.endDate)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.days')}</p>
            <p className="erp-employee-meta-value">{request.days}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.dailyRate')}</p>
            <p className="erp-employee-meta-value">
              {formatCurrencyAmount(request.dailyRate, request.currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.labels.destinationCategory')}>
                  <span className="erp-users-role-tag">
                    {request.destinationCategory}
                  </span>
                </MetaItem>
                <MetaItem label={t('hr.labels.destination')}>
                  <span className="erp-users-cell-strong">
                    {request.destination}
                  </span>
                </MetaItem>
                <MetaItem label={t('hr.labels.startDate')}>
                  {formatProjectDate(request.startDate)}
                </MetaItem>
                <MetaItem label={t('hr.labels.endDate')}>
                  {formatProjectDate(request.endDate)}
                </MetaItem>
                <MetaItem label={t('hr.labels.days')}>
                  <span className="erp-users-cell-strong">{request.days}</span>
                </MetaItem>
                <MetaItem label={t('hr.labels.dailyRate')}>
                  {formatCurrencyAmount(request.dailyRate, request.currency)}
                </MetaItem>
                <MetaItem label={t('hr.table.employee')}>
                  {employeeName}
                </MetaItem>
                {linkedTravel ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.linkedTravel')}>
                      {linkedTravel}
                    </MetaItem>
                  </div>
                ) : null}
                {request.notes?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.notes')}>
                      <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                        {request.notes}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            <DetailSection
              title={t('hr.labels.budgetEstimate')}
              bodyClassName="!p-0"
            >
              <div className="divide-y divide-[#eef1f4]">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                  <span className="erp-users-cell-sub text-sm">
                    {t('hr.labels.days')} ×{' '}
                    {formatCurrencyAmount(request.dailyRate, request.currency)}
                  </span>
                  <span className="erp-users-cell-strong tabular-nums text-sm">
                    {formatCurrencyAmount(request.totalAmount, request.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 bg-[var(--color-surface-secondary)] px-3 py-3 sm:px-4">
                  <span className="erp-users-cell-strong text-sm">
                    {t('hr.table.total')} (ETB)
                  </span>
                  <span className="erp-employee-meta-value tabular-nums">
                    {formatEtbAmount(request.totalAmountEtb)}
                  </span>
                </div>
              </div>
            </DetailSection>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-4">
          {request.approvalRequest ? (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={request.approvalRequest.currentTier ?? 0}
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
        title={t('hr.dialog.cancelPerDiemTitle')}
        description={t('hr.dialog.cancelPerDiemDesc')}
        confirmLabel={t('hr.buttons.cancel')}
        danger
        confirmLoading={cancelMutation.isPending}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
