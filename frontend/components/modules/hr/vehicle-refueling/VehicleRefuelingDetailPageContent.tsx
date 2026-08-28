'use client';

import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Skeleton, Space, Tag, Typography } from 'antd';
import { ArrowLeft, Upload as UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCancelVehicleRefueling,
  useUploadRefuelingReceipt,
  useVehicleRefueling,
} from '@/lib/query/vehicle-refueling';
import { useCurrentUser } from '@/lib/query/profile';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Vehicle refueling detail — aligned with Purchase Request chrome.
 */
export default function VehicleRefuelingDetailPageContent({
  refuelingId,
}: {
  refuelingId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useVehicleRefueling(refuelingId);
  const cancelMutation = useCancelVehicleRefueling(refuelingId);
  const uploadMutation = useUploadRefuelingReceipt(refuelingId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);

  const refueling = detailQuery.data;
  const isOwner =
    Boolean(refueling) && refueling?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner &&
    (refueling?.status === 'DRAFT' || refueling?.status === 'SUBMITTED');
  const showReceiptUpload =
    refueling?.status === 'APPROVED' && !refueling?.receiptDocumentId;
  const isDirectApproved =
    refueling?.status === 'APPROVED' && !refueling.approvalRequestId;

  const tiers = useMemo(
    () => (refueling?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [refueling?.approvalRequest?.tiers],
  );

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.vehicleRefuelingCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.vehicleRefuelingCancelFailed'),
        messageApi,
      );
    }
  }

  async function handleReceiptUpload(file: File): Promise<void> {
    try {
      await uploadMutation.mutateAsync(file);
      messageApi.success(t('hr.messages.vehicleRefuelingReceiptUploaded'));
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.vehicleRefuelingReceiptUploadFailed'),
        messageApi,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !refueling) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('hr.messages.vehicleRefuelingNotFound')
          }
          action={
            <Button
              onClick={() => router.push('/hr/vehicle-refueling')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/vehicle-refueling')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.back')}
        </Button>
        <Space wrap size={8} className="ml-auto">
          {canCancel ? (
            <Button
              danger
              onClick={() => setConfirmCancel(true)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.cancelRequest')}
            </Button>
          ) : null}
        </Space>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div
            className="overflow-hidden rounded-none"
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <div className="px-3 py-4 sm:px-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {refueling.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
                <StatusBadge
                  label={formatVehicleRefuelingStatus(refueling.status, t)}
                  variant={vehicleRefuelingStatusVariant(refueling.status)}
                />
                {isDirectApproved ? (
                  <Tag color="blue">{t('hr.labels.directApproval')}</Tag>
                ) : null}
                {refueling.receiptDocumentId ? (
                  <Tag color="green">{t('hr.labels.receiptAttached')}</Tag>
                ) : null}
              </div>
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {t('pages.hr.vehicleRefueling.detail')} —{' '}
                {refueling.vehicle?.plateNumber ?? t('hr.labels.noVehicle')}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatVehicleRefuelingEmployeeName(refueling.employee)}
                {refueling.submittedAt
                  ? ` · ${formatProjectDate(refueling.submittedAt)}`
                  : null}
              </p>
            </div>

            {refueling.status === 'RETURNED' && isOwner ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5"
                style={{
                  background: tokens.colorAmber50,
                  borderTop: `1px solid ${tokens.colorAmber400}`,
                }}
              >
                <Typography.Text style={{ color: tokens.colorAmber400 }}>
                  {t('hr.messages.vehicleRefuelingReturned')}
                </Typography.Text>
                {refueling.approvalRequestId ? (
                  <Button
                    size="small"
                    onClick={() =>
                      router.push(`/approvals/${refueling.approvalRequestId}`)
                    }
                    style={{ borderRadius: 0 }}
                  >
                    {t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <SummaryStrip
            items={[
              {
                label: t('hr.labels.fuelStation'),
                value: refueling.fuelStation,
              },
              {
                label: t('hr.labels.fuelType'),
                value: formatFuelType(refueling.fuelType, t),
              },
              {
                label: t('hr.table.litres'),
                value: refueling.requestedLitres?.toString() ?? '—',
              },
              {
                label: t('hr.form.unitPriceEtb'),
                value:
                  refueling.unitPriceEtb != null
                    ? formatEtbAmount(refueling.unitPriceEtb)
                    : '—',
              },
              {
                label: t('hr.labels.totalCostEtb'),
                value:
                  refueling.totalCostEtb != null
                    ? formatEtbAmount(refueling.totalCostEtb)
                    : '—',
              },
            ]}
          />

          <SectionCard
            title={t('hr.section.requestDetails')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.form.fuelDate')}>
                {formatProjectDate(refueling.fuelDate)}
              </MetaItem>
              <MetaItem label={t('hr.form.currentMileage')}>
                {refueling.currentMileage?.toString() ?? '—'}
              </MetaItem>
              <MetaItem label={t('hr.form.vehicle')}>
                {refueling.vehicle
                  ? `${refueling.vehicle.plateNumber} — ${refueling.vehicle.make} ${refueling.vehicle.model}`
                  : '—'}
              </MetaItem>
              {refueling.driver ? (
                <MetaItem label={t('hr.form.driver')}>
                  {formatVehicleRefuelingEmployeeName(refueling.driver)}
                </MetaItem>
              ) : null}
              {refueling.completedAt ? (
                <MetaItem label={t('hr.labels.completedAt')}>
                  {formatProjectDate(refueling.completedAt)}
                </MetaItem>
              ) : null}
              {refueling.notes ? (
                <MetaItem label={t('hr.form.notes')}>
                  <p className="m-0 whitespace-pre-wrap leading-relaxed">
                    {refueling.notes}
                  </p>
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>

          {showReceiptUpload ? (
            <SectionCard
              title={t('hr.form.receipt')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <Alert
                type="info"
                showIcon
                className="mb-4"
                title={t('hr.messages.vehicleRefuelingReceiptRequired')}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleReceiptUpload(file);
                  }
                  e.target.value = '';
                }}
              />
              <Button
                icon={<UploadIcon size={14} />}
                loading={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.attachReceipt')}
              </Button>
            </SectionCard>
          ) : null}

          {refueling.receiptDocument ? (
            <SectionCard
              title={t('hr.table.receipt')}
              bodyClassName="px-3 py-4 sm:px-5"
            >
              <AttachmentDownloadList
                documents={[refueling.receiptDocument]}
                emptyLabel={t('hr.empty.noAttachments')}
              />
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          {isDirectApproved || tiers.length === 0 ? (
            <SectionCard
              title={t('hr.section.approvalChain')}
              bodyClassName="px-3 py-4 sm:px-4"
            >
              <Typography.Text type="secondary">
                {isDirectApproved
                  ? t('hr.messages.directApprovalNoChain')
                  : t('hr.empty.noApprovalChain')}
              </Typography.Text>
            </SectionCard>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={refueling.approvalRequest?.currentTier ?? 1}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('hr.dialog.cancelVehicleRefuelingTitle')}
        description={t('hr.dialog.cancelVehicleRefuelingDesc')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
