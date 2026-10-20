'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useMemo, useState } from 'react';
import { Alert, Button, Form, Grid, Input, InputNumber, Modal, Skeleton, Space } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanEditHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useAddPerDiemDisbursement,
  useCancelPerDiemRequest,
  useMarkPerDiemPaid,
  usePerDiemRequest,
  useSettlePerDiemRequest,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
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
 * Per diem request detail - Users / employee profile chrome.
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
  const canEditHr = useCanEditHr();
  const detailQuery = usePerDiemRequest(requestId);
  const cancelMutation = useCancelPerDiemRequest(requestId);
  const markPaidMutation = useMarkPerDiemPaid(requestId);
  const addDisbursementMutation = useAddPerDiemDisbursement(requestId);
  const settleMutation = useSettlePerDiemRequest(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [markPaidForm] = Form.useForm<{
    paidAmount?: number;
    paymentReference?: string;
  }>();
  const [disbursementForm] = Form.useForm<{
    amount: number;
    disbursedAt: string;
    coveredDaysFrom: string;
    coveredDaysTo: string;
    notes?: string;
  }>();
  const [settleForm] = Form.useForm<{
    actualReturnDate: string;
    actualDaysOverride?: number;
    notes?: string;
  }>();

  useSetHeaderExtra(null);

  const request = detailQuery.data;
  const isOwner =
    Boolean(request) && request?.employeeId === currentUser.data?.id;
  const isSubmitter =
    Boolean(request) && request?.createdBy === currentUser.data?.id;
  const canCancel =
    (isOwner || isSubmitter) &&
    !request?.settlementId &&
    (request?.status === 'DRAFT' || request?.status === 'SUBMITTED');
  const canMarkPaid =
    canEditHr &&
    request?.status === 'APPROVED' &&
    !request.paidAt &&
    !request.settlementId;
  const canAddDisbursement =
    canEditHr &&
    (request?.status === 'APPROVED' || request?.status === 'ACTIVE');
  const canSettle =
    canEditHr &&
    request?.status === 'ACTIVE' &&
    !request?.requestSettlement;

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  async function handleAddDisbursement(): Promise<void> {
    try {
      const values = await disbursementForm.validateFields();
      await addDisbursementMutation.mutateAsync({
        amount: values.amount,
        disbursedAt: values.disbursedAt,
        coveredDaysFrom: values.coveredDaysFrom,
        coveredDaysTo: values.coveredDaysTo,
        notes: values.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.perDiem.disbursementAdded'));
      setDisbursementOpen(false);
      disbursementForm.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      notifyApiError(error, t('hr.perDiem.disbursementFailed'), messageApi);
    }
  }

  async function handleSettle(): Promise<void> {
    try {
      const values = await settleForm.validateFields();
      await settleMutation.mutateAsync({
        actualReturnDate: values.actualReturnDate,
        actualDaysOverride: values.actualDaysOverride,
        notes: values.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.perDiem.settledSuccess'));
      setSettleOpen(false);
      settleForm.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      notifyApiError(error, t('hr.perDiem.settleFailed'), messageApi);
    }
  }

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

  async function handleMarkPaid(): Promise<void> {
    try {
      const values = await markPaidForm.validateFields();
      await markPaidMutation.mutateAsync({
        paidAmount: values.paidAmount,
        paymentReference: values.paymentReference?.trim() || undefined,
      });
      messageApi.success(t('pages.hr.perDiem.markPaidSuccess'));
      setMarkPaidOpen(false);
      markPaidForm.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      notifyApiError(error, t('pages.hr.perDiem.markPaidFailed'), messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-per-diem-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
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
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-per-diem-detail-page ${DETAIL_PAGE_V2}`}>
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
            {canMarkPaid ? (
              <Button type="primary" onClick={() => setMarkPaidOpen(true)}>
                {t('pages.hr.perDiem.markPaid')}
              </Button>
            ) : null}
            {canAddDisbursement ? (
              <Button onClick={() => setDisbursementOpen(true)}>
                {t('hr.perDiem.addDisbursement')}
              </Button>
            ) : null}
            {canSettle ? (
              <Button type="primary" onClick={() => setSettleOpen(true)}>
                {t('hr.perDiem.settle')}
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
              {formatEtbAmount(request.dailyRate)}
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
                <MetaItem label={t('hr.form.tripType')}>
                  {request.tripType === 'SITE_DEPLOYMENT'
                    ? t('hr.form.tripTypeSiteDeployment')
                    : t('hr.form.tripTypeTravel')}
                </MetaItem>
                <MetaItem label={t('hr.form.departureTime')}>
                  {request.departureTime ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.returnTime')}>
                  {request.returnTime ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.labels.dailyRate')}>
                  {formatEtbAmount(request.dailyRate)}
                </MetaItem>
                <MetaItem label={t('pages.hr.perDiem.pvNumber')}>
                  {request.pvNumber ? (
                    <span className="erp-users-id-chip">{request.pvNumber}</span>
                  ) : (
                    '-'
                  )}
                </MetaItem>
                <MetaItem label={t('pages.hr.perDiem.pvDate')}>
                  {request.pvDate ? formatProjectDate(request.pvDate) : '-'}
                </MetaItem>
                <MetaItem label={t('pages.hr.perDiem.paid')}>
                  {request.paidAt ? (
                    <span className="erp-users-cell-strong">
                      {formatProjectDate(request.paidAt)}
                    </span>
                  ) : request.status === 'APPROVED' ? (
                    t('pages.hr.perDiem.unpaid')
                  ) : (
                    '-'
                  )}
                </MetaItem>
                {request.paidAt ? (
                  <MetaItem label={t('pages.hr.perDiem.paidBy')}>
                    {request.payer
                      ? formatPerDiemEmployeeName(request.payer)
                      : '-'}
                  </MetaItem>
                ) : null}
                {request.paymentReference ? (
                  <MetaItem label={t('pages.hr.perDiem.paymentReference')}>
                    {request.paymentReference}
                  </MetaItem>
                ) : null}
                <MetaItem label={t('pages.hr.perDiem.settled')}>
                  {request.settlement?.requestNumber ? (
                    <button
                      type="button"
                      className="erp-users-id-chip"
                      onClick={() =>
                        router.push(
                          `/hr/per-diem/settlements/${request.settlement?.id}`,
                        )
                      }
                    >
                      {t('pages.hr.perDiem.settledIn', {
                        number: request.settlement.requestNumber,
                      })}
                    </button>
                  ) : (
                    '-'
                  )}
                </MetaItem>
                <MetaItem label={t('hr.table.employee')}>
                  {employeeName}
                </MetaItem>
                {request.siteAssignment ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.form.linkedSiteAssignment')}>
                      <button
                        type="button"
                        className="erp-users-id-chip"
                        onClick={() =>
                          router.push(
                            `/hr/site-assignments/${request.siteAssignment?.id}`,
                          )
                        }
                      >
                        {request.siteAssignment.requestNumber} -{' '}
                        {request.siteAssignment.siteName}
                      </button>
                    </MetaItem>
                  </div>
                ) : null}
                {linkedTravel ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.linkedTravel')}>
                      {linkedTravel}
                    </MetaItem>
                  </div>
                ) : null}
                {(request.requestedDailyRate != null || request.approvedDailyRate != null) ? (
                  <div className="md:col-span-2">
                    <div className="rounded-md p-4" style={{ background: 'var(--color-teal-50)', border: '1px solid var(--color-teal-400)' }}>
                      <div className="mb-3 flex items-center gap-2">
                        <span className="erp-users-role-tag" style={{ background: 'var(--color-teal-50)', color: 'var(--color-teal-600)', borderColor: 'var(--color-teal-400)' }}>
                          {t('hr.perDiem.rateOverrideRequested')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <MetaItem label={t('hr.labels.dailyRate')}>
                          {formatEtbAmount(request.dailyRate)}
                        </MetaItem>
                        {request.requestedDailyRate != null ? (
                          <MetaItem label={t('hr.perDiem.requestedDailyRate')}>
                            <span className="erp-users-cell-strong">
                              {formatEtbAmount(request.requestedDailyRate)}
                            </span>
                          </MetaItem>
                        ) : null}
                        {request.approvedDailyRate != null ? (
                          <MetaItem label={t('hr.perDiem.approvedDailyRate')}>
                            <span className="erp-users-cell-strong">
                              {formatEtbAmount(request.approvedDailyRate)}
                            </span>
                          </MetaItem>
                        ) : null}
                        <MetaItem label={t('hr.form.totalAmount')}>
                          {formatEtbAmount(request.totalAmount)}
                        </MetaItem>
                        {request.requestedDailyRate != null ? (
                          <MetaItem label={t('hr.perDiem.requestedTotal')}>
                            <span className="erp-users-cell-strong">
                              {formatEtbAmount(Number(request.requestedDailyRate) * request.days)}
                            </span>
                          </MetaItem>
                        ) : null}
                        {request.rateOverrideReason ? (
                          <div className="sm:col-span-2">
                            <MetaItem label={t('hr.perDiem.rateOverrideReason')}>
                              <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                                {request.rateOverrideReason}
                              </p>
                            </MetaItem>
                          </div>
                        ) : null}
                      </div>
                    </div>
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
                    {formatEtbAmount(request.dailyRate)}
                  </span>
                  <span className="erp-users-cell-strong tabular-nums text-sm">
                    {formatEtbAmount(request.totalAmount)}
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

            {(request.disbursements?.length ?? 0) > 0 ? (
              <DetailSection
                title={t('hr.perDiem.disbursements')}
                bodyClassName="!p-0"
              >
                <div className="divide-y divide-[#eef1f4]">
                  {request.disbursements!.map((d, i) => (
                    <div key={d.id} className="px-3 py-3 sm:px-4">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="erp-users-cell-sub text-xs">
                          #{i + 1} · {formatProjectDate(d.coveredDaysFrom)}–{formatProjectDate(d.coveredDaysTo)}
                        </span>
                        <span className="erp-users-cell-strong tabular-nums text-sm">
                          {formatEtbAmount(d.amount)}
                        </span>
                      </div>
                      <div className="erp-users-cell-sub text-xs">
                        {t('hr.perDiem.disbursedOn')} {formatProjectDate(d.disbursedAt)}
                        {d.disbursedBy
                          ? ` · ${formatPerDiemEmployeeName(d.disbursedBy)}`
                          : ''}
                      </div>
                      {d.notes ? (
                        <p className="erp-users-cell-sub m-0 mt-1 whitespace-pre-wrap text-xs">
                          {d.notes}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 bg-[var(--color-surface-secondary)] px-3 py-3 sm:px-4">
                    <span className="erp-users-cell-strong text-sm">
                      {t('hr.perDiem.totalDisbursed')}
                    </span>
                    <span className="erp-employee-meta-value tabular-nums">
                      {formatEtbAmount(
                        request.disbursements!.reduce(
                          (s, d) => s + Number(d.amount),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              </DetailSection>
            ) : null}

            {request.requestSettlement ? (
              <DetailSection title={t('hr.perDiem.settlement')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <MetaItem label={t('hr.perDiem.actualReturnDate')}>
                    {formatProjectDate(request.requestSettlement.actualReturnDate)}
                  </MetaItem>
                  <MetaItem label={t('hr.perDiem.actualDays')}>
                    <span className="erp-users-cell-strong">
                      {request.requestSettlement.actualDays}
                    </span>
                  </MetaItem>
                  <MetaItem label={t('hr.perDiem.earnedTotal')}>
                    {formatEtbAmount(request.requestSettlement.earnedTotal)}
                  </MetaItem>
                  <MetaItem label={t('hr.perDiem.totalDisbursed')}>
                    {formatEtbAmount(request.requestSettlement.totalDisbursed)}
                  </MetaItem>
                  <MetaItem label={t('hr.perDiem.balance')}>
                    <span
                      className={
                        Number(request.requestSettlement.balance) >= 0
                          ? 'erp-users-cell-strong text-green-700 dark:text-green-400'
                          : 'erp-users-cell-strong text-red-600 dark:text-red-400'
                      }
                    >
                      {formatEtbAmount(request.requestSettlement.balance)}
                      {Number(request.requestSettlement.balance) >= 0
                        ? ` (${t('hr.perDiem.owedToEmployee')})`
                        : ` (${t('hr.perDiem.owedToCompany')})`}
                    </span>
                  </MetaItem>
                  <MetaItem label={t('hr.perDiem.settledBy')}>
                    {request.requestSettlement.settledBy
                      ? formatPerDiemEmployeeName(request.requestSettlement.settledBy)
                      : '-'}
                  </MetaItem>
                  <MetaItem label={t('hr.perDiem.settledAt')}>
                    {formatProjectDate(request.requestSettlement.settledAt)}
                  </MetaItem>
                  {request.requestSettlement.notes ? (
                    <div className="md:col-span-2">
                      <MetaItem label={t('hr.labels.notes')}>
                        <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                          {request.requestSettlement.notes}
                        </p>
                      </MetaItem>
                    </div>
                  ) : null}
                </div>
              </DetailSection>
            ) : null}
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

      <Modal
        open={markPaidOpen}
        centered
        width={520}
        title={t('pages.hr.perDiem.markPaidTitle')}
        onCancel={() => {
          setMarkPaidOpen(false);
          markPaidForm.resetFields();
        }}
        onOk={() => void handleMarkPaid()}
        confirmLoading={markPaidMutation.isPending}
        okText={t('pages.hr.perDiem.markPaid')}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <p className="erp-hr-travel-modal-hint">
          {t('pages.hr.perDiem.markPaidDescription')}
        </p>
        <Form
          form={markPaidForm}
          layout="vertical"
          initialValues={{
            paidAmount: request.totalAmount
              ? Number(request.totalAmount)
              : undefined,
          }}
        >
          <Form.Item
            name="paidAmount"
            label={t('pages.hr.perDiem.paidAmountLabel')}
          >
            <InputNumber min={0} precision={2} className="w-full" />
          </Form.Item>
          <Form.Item
            name="paymentReference"
            label={t('pages.hr.perDiem.paymentReference')}
          >
            <Input
              maxLength={500}
              placeholder={t('pages.hr.perDiem.paymentReferencePlaceholder')}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={disbursementOpen}
        centered
        width={520}
        title={t('hr.perDiem.addDisbursementTitle')}
        onCancel={() => {
          setDisbursementOpen(false);
          disbursementForm.resetFields();
        }}
        onOk={() => void handleAddDisbursement()}
        confirmLoading={addDisbursementMutation.isPending}
        okText={t('hr.perDiem.addDisbursement')}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <Form form={disbursementForm} layout="vertical">
          <Form.Item
            name="amount"
            label={t('hr.perDiem.disbursementAmount')}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} precision={2} className="w-full" suffix="ETB" />
          </Form.Item>
          <Form.Item
            name="disbursedAt"
            label={t('hr.perDiem.disbursedOn')}
            rules={[{ required: true }]}
          >
            <Input type="date" className="w-full" />
          </Form.Item>
          <Form.Item
            name="coveredDaysFrom"
            label={t('hr.perDiem.coveredFrom')}
            rules={[{ required: true }]}
          >
            <Input type="date" className="w-full" />
          </Form.Item>
          <Form.Item
            name="coveredDaysTo"
            label={t('hr.perDiem.coveredTo')}
            rules={[{ required: true }]}
          >
            <Input type="date" className="w-full" />
          </Form.Item>
          <Form.Item name="notes" label={t('hr.labels.notes')}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={settleOpen}
        centered
        width={520}
        title={t('hr.perDiem.settleTitle')}
        onCancel={() => {
          setSettleOpen(false);
          settleForm.resetFields();
        }}
        onOk={() => void handleSettle()}
        confirmLoading={settleMutation.isPending}
        okText={t('hr.perDiem.settle')}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <p className="erp-hr-travel-modal-hint">
          {t('hr.perDiem.settleDescription')}
        </p>
        <Form form={settleForm} layout="vertical">
          <Form.Item
            name="actualReturnDate"
            label={t('hr.perDiem.actualReturnDate')}
            rules={[{ required: true }]}
          >
            <Input type="date" className="w-full" />
          </Form.Item>
          <Form.Item
            name="actualDaysOverride"
            label={t('hr.perDiem.actualDaysOverride')}
            extra={t('hr.perDiem.actualDaysOverrideHint')}
          >
            <InputNumber min={1} className="w-full" />
          </Form.Item>
          <Form.Item name="notes" label={t('hr.labels.notes')}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        className="erp-hr-travel-modal"
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
