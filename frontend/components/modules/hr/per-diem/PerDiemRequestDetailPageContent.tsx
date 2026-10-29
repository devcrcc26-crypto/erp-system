'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/profile/profile-v2.css';
import '@/components/modules/users/employee-detail-v2.css';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
} from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
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
  useFormalizeRequestSettlementBalance,
  usePerDiemRequest,
  useSettlePerDiemRequest,
  useUploadDisbursementAttachment,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemAmounts,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import PerDiemRateSummary from '@/components/modules/hr/per-diem/PerDiemRateSummary';

function inclusiveCalendarDays(from: string, to: string): number | null {
  const start = dayjs(from.slice(0, 10));
  const end = dayjs(to.slice(0, 10));
  if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) {
    return null;
  }
  return end.diff(start, 'day') + 1;
}

function eachDayKeys(startIso: string, endIso: string): string[] {
  const start = dayjs(startIso.slice(0, 10));
  const end = dayjs(endIso.slice(0, 10));
  if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) {
    return [];
  }
  const keys: string[] = [];
  let cursor = start;
  while (!cursor.isAfter(end, 'day')) {
    keys.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return keys;
}

function DetailSection({
  title,
  children,
  className = '',
  bodyClassName = '',
  id,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}): React.ReactNode {
  return (
    <div id={id} className={`erp-employee-section ${className}`.trim()}>
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
  const addDisbursementMutation = useAddPerDiemDisbursement(requestId);
  const uploadAttachmentMutation = useUploadDisbursementAttachment(requestId);
  const settleMutation = useSettlePerDiemRequest(requestId);
  const formalizeBalanceMutation =
    useFormalizeRequestSettlementBalance(requestId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [formalizeBalanceOpen, setFormalizeBalanceOpen] = useState(false);
  const [pendingReceiptFiles, setPendingReceiptFiles] = useState<File[]>([]);
  const [uploadingReceipts, setUploadingReceipts] = useState(false);
  const [disbursementForm] = Form.useForm<{
    disbursedAt: string;
    coveredDaysFrom: string;
    coveredDaysTo: string;
    notes?: string;
  }>();
  const disbursementFormValues = Form.useWatch([], disbursementForm) as
    | {
        coveredDaysFrom?: string;
        coveredDaysTo?: string;
      }
    | undefined;

  const disbursementAmountPreview = useMemo(() => {
    const req = detailQuery.data;
    if (!req) {
      return null;
    }
    const from = disbursementFormValues?.coveredDaysFrom;
    const to = disbursementFormValues?.coveredDaysTo;
    if (!from || !to) {
      return null;
    }
    const days = inclusiveCalendarDays(from, to);
    if (days == null || days < 1) {
      return null;
    }
    const dailyRate = Number(req.approvedDailyRate ?? req.dailyRate);
    if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
      return null;
    }
    return {
      days,
      dailyRate,
      amount: days * dailyRate,
    };
  }, [detailQuery.data, disbursementFormValues]);
  const [settleForm] = Form.useForm<{
    actualReturnDate: string;
    actualDaysOverride?: number;
    notes?: string;
  }>();
  const [formalizeBalanceForm] = Form.useForm<{
    paymentReference: string;
    paymentDate: dayjs.Dayjs;
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
  const canAddDisbursement =
    Boolean(request?.canDisburse ?? canEditHr) &&
    (request?.status === 'APPROVED' || request?.status === 'ACTIVE');
  const canSettle =
    canEditHr &&
    request?.status === 'ACTIVE' &&
    !request?.requestSettlement;
  const settlementBalanceAmount = request?.requestSettlement
    ? Number(request.requestSettlement.balance)
    : 0;
  const balanceOwedToEmployee = settlementBalanceAmount > 0;
  const balanceOwedToCompany = settlementBalanceAmount < 0;
  const canFormalizeBalance =
    canEditHr &&
    Boolean(request?.requestSettlement) &&
    !request?.requestSettlement?.balancePaidAt &&
    settlementBalanceAmount !== 0;

  const tiers = useMemo(
    () => (request?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [request?.approvalRequest?.tiers],
  );

  const availableDisbursementDays = useMemo(() => {
    if (!request?.startDate || !request?.endDate) {
      return [] as string[];
    }
    const requestDays = eachDayKeys(request.startDate, request.endDate);
    const covered = new Set<string>();
    for (const row of request.disbursements ?? []) {
      for (const day of eachDayKeys(row.coveredDaysFrom, row.coveredDaysTo)) {
        covered.add(day);
      }
    }
    return requestDays.filter((day) => !covered.has(day));
  }, [request]);

  const disbursementDayOptions = useMemo(
    () =>
      availableDisbursementDays.map((day) => ({
        value: day,
        label: formatProjectDate(day),
      })),
    [availableDisbursementDays],
  );

  async function handleAddDisbursement(): Promise<void> {
    try {
      const values = await disbursementForm.validateFields();
      const updated = await addDisbursementMutation.mutateAsync({
        disbursedAt: values.disbursedAt,
        coveredDaysFrom: values.coveredDaysFrom,
        coveredDaysTo: values.coveredDaysTo,
        notes: values.notes?.trim() || undefined,
      });
      const disbursements = updated.disbursements ?? [];
      const newDisbursement = disbursements[disbursements.length - 1];
      if (newDisbursement && pendingReceiptFiles.length > 0) {
        setUploadingReceipts(true);
        try {
          for (const file of pendingReceiptFiles) {
            await uploadAttachmentMutation.mutateAsync({
              disbursementId: newDisbursement.id,
              file,
            });
          }
        } finally {
          setUploadingReceipts(false);
        }
      }
      messageApi.success(t('hr.perDiem.disbursementAdded'));
      setDisbursementOpen(false);
      disbursementForm.resetFields();
      setPendingReceiptFiles([]);
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

  async function handleFormalizeBalance(): Promise<void> {
    try {
      const values = await formalizeBalanceForm.validateFields();
      await formalizeBalanceMutation.mutateAsync({
        paymentReference: values.paymentReference.trim(),
        paymentDate: values.paymentDate.format('YYYY-MM-DD'),
      });
      messageApi.success(t('hr.perDiem.formalizeBalanceSuccess'));
      setFormalizeBalanceOpen(false);
      formalizeBalanceForm.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      notifyApiError(error, t('hr.perDiem.formalizeBalanceFailed'), messageApi);
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

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-per-diem-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 ${DETAIL_PAGE_V2}`}>
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
  const hasDisbursement = (request.disbursements?.length ?? 0) > 0;
  const firstDisbursedAt = request.disbursements?.[0]?.disbursedAt;
  const linkedTravel = request.linkedFlight
    ? `${t('hr.labels.flight')} ${request.linkedFlight.applicationNumber} · ${request.linkedFlight.destination}`
    : request.linkedTrip
      ? `${t('pages.hr.businessTrip.detail')} ${request.linkedTrip.tripNumber} · ${request.linkedTrip.destinationCity}, ${request.linkedTrip.destinationCountry}`
      : null;

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-profile-page erp-profile-v2 erp-employee-detail-v2 erp-per-diem-detail-page w-full max-w-none ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card erp-profile-identity">
        <div className="erp-employee-toolbar">
          <Button
            type="text"
            icon={<ArrowLeft size={16} aria-hidden />}
            onClick={() => router.push('/hr/per-diem')}
            aria-label={t('hr.buttons.backToList')}
            className="erp-employee-toolbar-back"
          >
            {isNarrow ? undefined : t('hr.buttons.back')}
          </Button>
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
            {canAddDisbursement && availableDisbursementDays.length > 0 ? (
              <Button
                onClick={() => {
                  disbursementForm.setFieldsValue({
                    coveredDaysFrom: availableDisbursementDays[0],
                    coveredDaysTo:
                      availableDisbursementDays[
                        availableDisbursementDays.length - 1
                      ],
                  });
                  setDisbursementOpen(true);
                }}
              >
                {t('hr.perDiem.addDisbursement')}
              </Button>
            ) : null}
            {canSettle ? (
              <Button type="primary" onClick={() => setSettleOpen(true)}>
                {t('hr.perDiem.settle')}
              </Button>
            ) : null}
            {canFormalizeBalance ? (
              <Button type="primary" onClick={() => setFormalizeBalanceOpen(true)}>
                {balanceOwedToEmployee
                  ? t('hr.perDiem.formalizeBalancePaymentEmployee')
                  : t('hr.perDiem.formalizeBalancePaymentCompany')}
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

        <div className="erp-employee-hero erp-profile-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="erp-profile-hero-badges mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
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

        <div className="erp-users-stat-bar erp-employee-meta-bar erp-profile-meta">
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
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="erp-pro-card min-w-0 w-full overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body w-full min-w-0">
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
                  {hasDisbursement && firstDisbursedAt ? (
                    <span className="erp-users-cell-strong">
                      {formatProjectDate(firstDisbursedAt)}
                    </span>
                  ) : request.status === 'APPROVED' ||
                    request.status === 'ACTIVE' ? (
                    t('pages.hr.perDiem.unpaid')
                  ) : (
                    '-'
                  )}
                </MetaItem>
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
                  ) : request.requestSettlement ? (
                    <button
                      type="button"
                      className="erp-users-id-chip"
                      onClick={() => {
                        document
                          .getElementById('per-diem-request-settlement')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {formatProjectDate(request.requestSettlement.settledAt)}
                    </button>
                  ) : request.status === 'SETTLED' ? (
                    t('common.yes')
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

            {/* Standard vs approved rate and the approved total paid out. */}
            <PerDiemRateSummary request={request} />

            {(request.disbursements?.length ?? 0) > 0 ? (
              <DetailSection
                title={t('hr.perDiem.disbursements')}
                className="w-full min-w-0"
                bodyClassName="erp-employee-section-body--flush"
              >
                <table className="w-full min-w-0 border-collapse">
                  <tbody>
                    {request.disbursements!.map((d, i) => (
                      <tr key={d.id} className="border-b border-[#eef1f4]">
                        <td className="px-4 py-3 sm:px-5" colSpan={2}>
                          <div className="mb-1 flex w-full items-center justify-between gap-2">
                            <span className="erp-users-cell-sub text-xs">
                              #{i + 1} · {formatProjectDate(d.coveredDaysFrom)}
                              –{formatProjectDate(d.coveredDaysTo)}
                            </span>
                            <span className="erp-users-cell-strong text-sm tabular-nums">
                              {formatEtbAmount(d.amount)}
                            </span>
                          </div>
                          <div className="erp-users-cell-sub text-xs">
                            {t('hr.perDiem.disbursedOn')}{' '}
                            {formatProjectDate(d.disbursedAt)}
                            {d.disbursedBy
                              ? ` · ${formatPerDiemEmployeeName(d.disbursedBy)}`
                              : ''}
                          </div>
                          {d.notes ? (
                            <p className="erp-users-cell-sub m-0 mt-1 whitespace-pre-wrap text-xs">
                              {d.notes}
                            </p>
                          ) : null}
                          {(d.attachments?.length ?? 0) > 0 ? (
                            <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                              {d.attachments!.map((attachment) => (
                                <li key={attachment.id}>
                                  <a
                                    href={attachment.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="erp-users-id-chip"
                                  >
                                    {attachment.fileName}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[var(--color-surface-secondary)]">
                      <td className="erp-users-cell-strong px-4 py-3 text-sm sm:px-5">
                        {t('hr.perDiem.totalDisbursed')}
                      </td>
                      <td className="erp-employee-meta-value px-4 py-3 text-right tabular-nums sm:px-5">
                        {formatEtbAmount(
                          request.disbursements!.reduce(
                            (s, d) => s + Number(d.amount),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </DetailSection>
            ) : null}

            {request.requestSettlement ? (
              <DetailSection
                title={t('hr.perDiem.settlement')}
                id="per-diem-request-settlement"
              >
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
                  {request.requestSettlement.balancePaidAt ? (
                    <>
                      <MetaItem
                        label={
                          balanceOwedToCompany
                            ? t('hr.perDiem.balancePaymentReferenceCompany')
                            : t('hr.perDiem.balancePaymentReference')
                        }
                      >
                        {request.requestSettlement.balancePaymentReference ?? '-'}
                      </MetaItem>
                      <MetaItem
                        label={
                          balanceOwedToCompany
                            ? t('hr.perDiem.balancePaymentDateCompany')
                            : t('hr.perDiem.balancePaymentDate')
                        }
                      >
                        {request.requestSettlement.balancePaymentDate
                          ? formatProjectDate(
                              request.requestSettlement.balancePaymentDate,
                            )
                          : '-'}
                      </MetaItem>
                      <MetaItem label={t('hr.perDiem.balanceFormalizedAt')}>
                        {formatProjectDate(request.requestSettlement.balancePaidAt)}
                      </MetaItem>
                      <MetaItem label={t('hr.perDiem.balanceFormalizedBy')}>
                        {request.requestSettlement.balancePaidBy
                          ? formatPerDiemEmployeeName(
                              request.requestSettlement.balancePaidBy,
                            )
                          : '-'}
                      </MetaItem>
                    </>
                  ) : null}
                </div>
                {canFormalizeBalance ? (
                  <div className="mt-4 flex justify-end border-t border-[var(--color-border)] pt-4">
                    <Button type="primary" onClick={() => setFormalizeBalanceOpen(true)}>
                      {balanceOwedToEmployee
                        ? t('hr.perDiem.formalizeBalancePaymentEmployee')
                        : t('hr.perDiem.formalizeBalancePaymentCompany')}
                    </Button>
                  </div>
                ) : null}
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
        open={disbursementOpen}
        centered
        width={520}
        title={t('hr.perDiem.addDisbursementTitle')}
        onCancel={() => {
          setDisbursementOpen(false);
          disbursementForm.resetFields();
          setPendingReceiptFiles([]);
        }}
        onOk={() => void handleAddDisbursement()}
        confirmLoading={
          addDisbursementMutation.isPending || uploadingReceipts
        }
        okText={t('hr.perDiem.addDisbursement')}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <Form form={disbursementForm} layout="vertical">
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
            rules={[
              { required: true },
              {
                validator: async (_, value: string | undefined) => {
                  if (!value) return;
                  if (!availableDisbursementDays.includes(value)) {
                    throw new Error(t('hr.perDiem.coveredDaysUnavailable'));
                  }
                },
              },
            ]}
          >
            <Select
              options={disbursementDayOptions}
              className="w-full"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="coveredDaysTo"
            label={t('hr.perDiem.coveredTo')}
            rules={[
              { required: true },
              {
                validator: async (_, value: string | undefined) => {
                  if (!value) return;
                  if (!availableDisbursementDays.includes(value)) {
                    throw new Error(t('hr.perDiem.coveredDaysUnavailable'));
                  }
                  const from = disbursementForm.getFieldValue(
                    'coveredDaysFrom',
                  ) as string | undefined;
                  if (from && value < from) {
                    throw new Error(t('hr.perDiem.coveredToBeforeFrom'));
                  }
                  const span = eachDayKeys(from ?? value, value);
                  const uncovered = span.every((day) =>
                    availableDisbursementDays.includes(day),
                  );
                  if (!uncovered) {
                    throw new Error(t('hr.perDiem.coveredDaysOverlap'));
                  }
                },
              },
            ]}
          >
            <Select
              options={disbursementDayOptions}
              className="w-full"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          {disbursementAmountPreview ? (
            <p className="erp-users-cell-strong m-0 mb-4 text-sm">
              {t('hr.perDiem.disbursementAmountPreview', {
                days: disbursementAmountPreview.days,
                amount: formatEtbAmount(disbursementAmountPreview.amount),
                dailyRate: formatEtbAmount(disbursementAmountPreview.dailyRate),
              })}
            </p>
          ) : null}
          {detailQuery.data ? (
            // The approved total is the ceiling; the API refuses anything above it.
            <p className="erp-users-cell-sub m-0 mb-4 text-sm">
              {t('hr.perDiem.disbursementRemaining', {
                remaining: formatEtbAmount(perDiemAmounts(detailQuery.data).remaining),
                total: formatEtbAmount(perDiemAmounts(detailQuery.data).approvedTotal),
              })}
            </p>
          ) : null}
          <Form.Item name="notes" label={t('hr.labels.notes')}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item label={t('hr.perDiem.receipts')} className="mb-0">
            <FileUploadInput
              files={pendingReceiptFiles}
              onChange={setPendingReceiptFiles}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              multiple
              disabled={
                addDisbursementMutation.isPending || uploadingReceipts
              }
            />
          </Form.Item>
          {uploadingReceipts ? (
            <p className="erp-users-cell-sub m-0 mt-2 text-xs">
              {t('hr.perDiem.uploadingReceipts')}
            </p>
          ) : null}
        </Form>
      </Modal>

      <Modal
        open={formalizeBalanceOpen}
        centered
        width={520}
        title={
          balanceOwedToEmployee
            ? t('hr.perDiem.formalizeBalancePaymentTitleEmployee')
            : t('hr.perDiem.formalizeBalancePaymentTitleCompany')
        }
        onCancel={() => {
          setFormalizeBalanceOpen(false);
          formalizeBalanceForm.resetFields();
        }}
        onOk={() => void handleFormalizeBalance()}
        confirmLoading={formalizeBalanceMutation.isPending}
        okText={t('common.save')}
        destroyOnHidden
        rootClassName="erp-hr-travel-modal"
        className="erp-hr-travel-modal"
      >
        <Form form={formalizeBalanceForm} layout="vertical">
          <Form.Item
            name="paymentReference"
            label={
              balanceOwedToCompany
                ? t('hr.perDiem.balancePaymentReferenceCompany')
                : t('hr.perDiem.balancePaymentReference')
            }
            rules={[{ required: true, message: t('hr.validation.required') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="paymentDate"
            label={
              balanceOwedToCompany
                ? t('hr.perDiem.balancePaymentDateCompany')
                : t('hr.perDiem.balancePaymentDate')
            }
            rules={[{ required: true, message: t('hr.validation.required') }]}
          >
            <DatePicker className="w-full" format="YYYY-MM-DD" />
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
