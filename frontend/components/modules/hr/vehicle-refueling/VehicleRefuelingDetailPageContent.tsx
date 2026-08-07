'use client';

import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Skeleton, Tag, Typography } from 'antd';
import { ArrowLeft, Upload as UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useCancelVehicleRefueling,
  useUploadRefuelingReceipt,
  useVehicleRefueling,
} from '@/lib/query/vehicle-refueling';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
  const isDirectApproved = Boolean(refueling?.directApproved);

  const tiers = useMemo(
    () => (refueling?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [refueling?.approvalRequest?.tiers],
  );

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success('Refueling request cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel request', messageApi);
    }
  }

  async function handleReceiptUpload(file: File): Promise<void> {
    try {
      await uploadMutation.mutateAsync(file);
      messageApi.success('Receipt uploaded successfully');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to upload receipt', messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !refueling) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Vehicle refueling request not found'
        }
        action={
          <Button onClick={() => router.push('/hr/vehicle-refueling')}>
            Back to list
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/hr/vehicle-refueling')}
        >
          Back
        </Button>
        {canCancel ? (
          <Button
            danger
            className="ml-auto"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel Request
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: tokens.colorCardBg,
              border: `1px solid ${tokens.colorBorder}`,
            }}
          >
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: tokens.colorTextTertiary }}
                >
                  {refueling.requestNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>|</span>
                <StatusBadge
                  label={formatVehicleRefuelingStatus(refueling.status, t)}
                  variant={vehicleRefuelingStatusVariant(refueling.status)}
                />
                {isDirectApproved ? (
                  <Tag color="blue">Direct approval</Tag>
                ) : null}
                {refueling.receiptDocumentId ? (
                  <Tag color="green">Receipt attached</Tag>
                ) : null}
              </div>
              <h2
                className="text-lg font-semibold leading-snug m-0"
                style={{ color: tokens.colorTextPrimary }}
              >
                Vehicle Refueling - {refueling.vehicle?.plateNumber}
              </h2>
              <p
                className="mt-1 text-sm m-0"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatVehicleRefuelingEmployeeName(refueling.employee)}
                {refueling.submittedAt
                  ? ` | Submitted ${formatProjectDate(refueling.submittedAt)}`
                  : null}
              </p>
            </div>
          </div>

          <SummaryStrip
            items={[
              { label: t('hr.labels.fuelStation'), value: refueling.fuelStation },
          { label: t('hr.labels.fuelType'), value: formatFuelType(refueling.fuelType, t) },
              {
                label: t('hr.table.litres'),
                value: refueling.requestedLitres?.toString() ?? '-',
              },
              {
                label: t('hr.labels.estimatedCost'),
                value: refueling.estimatedCostEtb?.toString() ?? '-',
              },
            ]}
          />

          <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetaItem label={t('hr.form.fuelDate')}>
                {formatProjectDate(refueling.fuelDate)}
              </MetaItem>
              <MetaItem label={t('hr.form.currentMileage')}>
                {refueling.currentMileage?.toString() ?? '-'}
              </MetaItem>
              <MetaItem label={t('hr.form.vehicle')}>
                {refueling.vehicle
                  ? `${refueling.vehicle.plateNumber} - ${refueling.vehicle.make} ${refueling.vehicle.model}`
                  : '-'}
              </MetaItem>
              {refueling.driver ? (
                <MetaItem label={t('hr.form.driver')}>
                  {formatVehicleRefuelingEmployeeName(refueling.driver)}
                </MetaItem>
              ) : null}
              {refueling.notes ? (
                <MetaItem label={t('hr.form.notes')}>
                  <p className="whitespace-pre-wrap leading-relaxed m-0">
                    {refueling.notes}
                  </p>
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>

          {showReceiptUpload ? (
            <SectionCard title={t('hr.form.receipt')} bodyClassName="px-5 py-4">
              <Alert
                type="info"
                showIcon
                className="mb-4"
                title="This request has been approved. Please upload the fuel receipt."
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
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
              >
                {t('hr.buttons.attachReceipt')}
              </Button>
            </SectionCard>
          ) : null}

          {refueling.receiptDocumentId ? (
            <SectionCard title={t('hr.table.receipt')} bodyClassName="px-5 py-4">
              <Typography.Text>
                Receipt attached
                {refueling.receiptDocument?.name
                  ? `: ${refueling.receiptDocument.name}`
                  : ''}
              </Typography.Text>
            </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0">
          <SectionCard title={t('hr.section.approvalChain')} bodyClassName="px-4 py-4">
            {isDirectApproved ? (
              <Typography.Text type="secondary">
                Approved directly - no approval required
              </Typography.Text>
            ) : tiers.length > 0 ? (
              <ApprovalTierTimeline
                tiers={tiers}
                currentTier={refueling.approvalRequest?.currentTier ?? 1}
              />
            ) : (
              <Typography.Text type="secondary">
                {t('hr.empty.noApprovalChain')}
              </Typography.Text>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel request?"
        description="This will cancel the vehicle refueling request and any open approval request."
        confirmLabel="Cancel Request"
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
