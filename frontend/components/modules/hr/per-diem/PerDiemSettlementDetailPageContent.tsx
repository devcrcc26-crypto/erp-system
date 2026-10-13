'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Form, Grid, Input, Modal, Skeleton } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { ArrowLeft } from 'lucide-react';
import dayjs from 'dayjs';
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
  useCancelPerDiemSettlement,
  usePerDiemSettlement,
  useRecordPerDiemCashReturned,
} from '@/lib/query/per-diem';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
/**
 * Per diem settlement detail — same sheet layout as the create form, plus approval and cash returned.
 */
export default function PerDiemSettlementDetailPageContent({
  settlementId,
}: {
  settlementId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isNarrow = screens.sm === false;
  const canEditHr = useCanEditHr();
  const currentUser = useCurrentUser();
  const detailQuery = usePerDiemSettlement(settlementId);
  const cancelMutation = useCancelPerDiemSettlement(settlementId);
  const cashMutation = useRecordPerDiemCashReturned(settlementId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashForm] = Form.useForm<{ receiptNo: string; date: dayjs.Dayjs }>();

  useSetHeaderExtra(null);

  const settlement = detailQuery.data;
  const isOwner = Boolean(settlement) && settlement?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner &&
    (settlement?.status === 'DRAFT' ||
      settlement?.status === 'SUBMITTED' ||
      settlement?.status === 'RETURNED');
  const canRecordCash =
    canEditHr &&
    settlement?.status === 'APPROVED' &&
    settlement.balanceDirection === 'TO_COMPANY';

  const tiers = useMemo(
    () => (settlement?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [settlement?.approvalRequest?.tiers],
  );

  const earned = Number(settlement?.perDiemEarned ?? 0);
  const advancesTotal = Number(settlement?.totalAdvances ?? 0);
  const balance = Number(settlement?.balance ?? 0);
  const directionLabel =
    settlement?.balanceDirection === 'TO_COMPANY'
      ? t('pages.hr.perDiemSettlement.balanceCompany')
      : settlement?.balanceDirection === 'TO_EMPLOYEE'
        ? t('pages.hr.perDiemSettlement.balanceEmployee')
        : t('pages.hr.perDiemSettlement.balanceNone');
  const kmDifference =
    settlement?.vehicleUsed &&
    settlement.kmDeparture != null &&
    settlement.kmReturn != null
      ? settlement.kmReturn - settlement.kmDeparture
      : null;

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.perDiemSettlementCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.failedToCancelPerDiemSettlement'), messageApi);
    }
  }

  async function handleCash(): Promise<void> {
    const values = await cashForm.validateFields();
    try {
      await cashMutation.mutateAsync({
        cashReturnedReceiptNo: values.receiptNo.trim(),
        cashReturnedDate: values.date.format('YYYY-MM-DD'),
      });
      messageApi.success(t('hr.messages.cashReturnedRecorded'));
      setCashOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.cashReturnedFailed'), messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !settlement) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.perDiemSettlementNotFound')
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

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employee-detail-page erp-per-diem-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push('/hr/per-diem')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canRecordCash ? (
              <Button type="primary" onClick={() => setCashOpen(true)}>
                {t('pages.hr.perDiemSettlement.recordCashReturned')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button danger icon={<StopOutlined />} onClick={() => setConfirmCancel(true)}>
                {isNarrow ? undefined : t('hr.buttons.cancel')}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="erp-employee-hero erp-contract-hero">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="erp-users-id-chip">{settlement.requestNumber}</span>
              <StatusBadge
                label={formatPerDiemStatus(settlement.status, t)}
                variant={perDiemStatusVariant(settlement.status)}
              />
              <span className="erp-users-role-tag">{settlement.destinationCategory}</span>
            </div>
            <h2 className="erp-users-name m-0">{settlement.destination}</h2>
            <p className="erp-users-email m-0 mt-1">
              {formatPerDiemEmployeeName(settlement.employee)}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-pro-card mt-3 overflow-hidden">
        <div className="erp-employee-section">
          <div className="erp-employee-section-header">
            <h3 className="erp-employee-section-title m-0">
              {t('pages.hr.perDiemSettlement.tripStep')}
            </h3>
          </div>
          <div className="erp-employee-section-body grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetaItem label={t('hr.form.departureDate')}>
              {formatProjectDate(settlement.actualDepartureDate)}{' '}
              {settlement.actualDepartureTime}
            </MetaItem>
            <MetaItem label={t('hr.form.returnDate')}>
              {formatProjectDate(settlement.actualReturnDate)} {settlement.actualReturnTime}
            </MetaItem>
            <MetaItem label={t('hr.form.perDiemDays')}>{settlement.actualDays}</MetaItem>
            <MetaItem label={t('hr.labels.dailyRate')}>
              {formatEtbAmount(settlement.dailyRate)}
            </MetaItem>
          </div>
        </div>
        <div className="erp-employee-section">
          <div className="erp-employee-section-header">
            <h3 className="erp-employee-section-title m-0">
              {t('pages.hr.perDiemSettlement.vehicleStep')}
            </h3>
          </div>
          <div className="erp-employee-section-body grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetaItem label={t('pages.hr.perDiemSettlement.vehicleUsed')}>
              {settlement.vehicleUsed ? t('common.yes') : t('common.no')}
            </MetaItem>
            <MetaItem label={t('pages.hr.perDiemSettlement.kmOut')}>
              {settlement.kmDeparture ?? '—'}
            </MetaItem>
            <MetaItem label={t('pages.hr.perDiemSettlement.kmIn')}>
              {settlement.kmReturn ?? '—'}
            </MetaItem>
            <MetaItem label={t('pages.hr.perDiemSettlement.kmDifference')}>
              {kmDifference ?? '—'}
            </MetaItem>
          </div>
        </div>
        <div className="erp-employee-section">
          <div className="erp-employee-section-header">
            <h3 className="erp-employee-section-title m-0">
              {t('pages.hr.perDiemSettlement.advancesStep')}
            </h3>
          </div>
          <div className="erp-employee-section-body">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {settlement.advances.map((advance) => (
                <li key={advance.id}>
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => router.push(`/hr/per-diem/${advance.id}`)}
                  >
                    <span className="erp-users-id-chip">
                      {advance.pvNumber ?? advance.requestNumber}
                    </span>
                    <span className="ms-2 text-sm">
                      {advance.pvDate ? formatProjectDate(advance.pvDate) : '—'}
                      {' · '}
                      {formatEtbAmount(advance.totalAmount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-[rgba(0,0,0,0.08)] pt-3">
              <CalcLine
                label={t('pages.hr.perDiemSettlement.advancesTaken')}
                value={formatEtbAmount(advancesTotal)}
              />
              <CalcLine
                label={t('pages.hr.perDiemSettlement.lessPerDiem', {
                  days: settlement.actualDays,
                  rate: formatEtbAmount(settlement.dailyRate),
                })}
                value={formatEtbAmount(earned)}
              />
              <div className="my-2 border-t border-[rgba(0,0,0,0.12)]" />
              <CalcLine label={directionLabel} value={formatEtbAmount(balance)} emphasize />
            </div>
          </div>
        </div>
        {settlement.cashReturnedReceiptNo ? (
          <div className="erp-employee-section">
            <div className="erp-employee-section-header">
              <h3 className="erp-employee-section-title m-0">
                {t('pages.hr.perDiemSettlement.cashReturned')}
              </h3>
            </div>
            <div className="erp-employee-section-body grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('pages.hr.perDiemSettlement.receiptNo')}>
                {settlement.cashReturnedReceiptNo}
              </MetaItem>
              <MetaItem label={t('pages.hr.perDiemSettlement.cashReturnedDate')}>
                {settlement.cashReturnedDate
                  ? formatProjectDate(settlement.cashReturnedDate)
                  : '—'}
              </MetaItem>
            </div>
          </div>
        ) : null}
        {tiers.length > 0 ? (
          <div className="erp-employee-section">
            <div className="erp-employee-section-header">
              <h3 className="erp-employee-section-title m-0">
                {t('hr.section.approvalChain')}
              </h3>
            </div>
            <div className="erp-employee-section-body">
              <ApprovalTierTimeline
                tiers={tiers}
                currentTier={settlement.approvalRequest?.currentTier ?? 0}
              />
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.messages.confirmCancelPerDiemSettlement')}
        description={t('hr.messages.confirmCancelPerDiemSettlementDesc')}
        confirmLabel={t('hr.buttons.cancel')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />

      <Modal
        open={cashOpen}
        title={t('pages.hr.perDiemSettlement.recordCashReturned')}
        onCancel={() => setCashOpen(false)}
        onOk={() => void handleCash()}
        confirmLoading={cashMutation.isPending}
        okText={t('common.save')}
      >
        <Form form={cashForm} layout="vertical">
          <Form.Item
            name="receiptNo"
            label={t('pages.hr.perDiemSettlement.receiptNo')}
            rules={[{ required: true, message: t('hr.validation.enterReceiptNo') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="date"
            label={t('pages.hr.perDiemSettlement.cashReturnedDate')}
            rules={[{ required: true, message: t('hr.validation.selectCashReturnedDate') }]}
          >
            <DatePicker className="w-full" format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function CalcLine({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm" style={{ color: tokens.colorTextSecondary }}>
        {label}
      </span>
      <span
        className={emphasize ? 'text-base font-bold' : 'text-sm font-semibold'}
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </span>
    </div>
  );
}
