'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Skeleton,
  Tag,
} from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons';
import { ArrowLeft, Fuel } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  openVehicleRefuelingPdf,
  useCancelVehicleRefueling,
  useUploadRefuelingReceipt,
  useVehicleRefueling,
} from '@/lib/query/vehicle-refueling';
import ExportPdfButton from '@/components/modules/hr/import-export/ExportPdfButton';
import { useCurrentUser } from '@/lib/query/profile';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
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

/**
 * Vehicle refueling detail - Users / employee profile chrome.
 */
export default function VehicleRefuelingDetailPageContent({
  refuelingId,
}: {
  refuelingId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const detailQuery = useVehicleRefueling(refuelingId);
  const cancelMutation = useCancelVehicleRefueling(refuelingId);
  const uploadMutation = useUploadRefuelingReceipt(refuelingId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);

  useSetHeaderExtra(null);

  const refueling = detailQuery.data;
  const isOwner =
    Boolean(refueling) && refueling?.employeeId === currentUser.data?.id;
  const canCancel =
    Boolean(isOwner) &&
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
        t,
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
        t,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-vehicle-refueling-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !refueling) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.vehicleRefuelingNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/hr/vehicle-refueling')}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatVehicleRefuelingEmployeeName(refueling.employee);
  const vehicleTitle = refueling.vehicle
    ? `${refueling.vehicle.plateNumber} · ${refueling.vehicle.make} ${refueling.vehicle.model}`
    : t('hr.labels.noVehicle');
  const backHref = '/hr/vehicle-refueling';

  const overflowMenuItems: MenuProps['items'] = [];
  if (refueling.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () =>
        router.push(`/approvals/${refueling.approvalRequestId}`),
    });
  }
  if (canCancel) {
    overflowMenuItems.push({
      key: 'cancel',
      label: t('hr.buttons.cancelRequest'),
      icon: <StopOutlined />,
      danger: true,
      onClick: () => setConfirmCancel(true),
    });
  }

  const showOverflowMenu = isNarrow && overflowMenuItems.length > 0;

  async function handleExportPdf(): Promise<void> {
    if (!refueling) return;
    await openVehicleRefuelingPdf(refueling.id);
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-vehicle-refueling-detail-page ${DETAIL_PAGE_V2}`}>
      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(backHref)}
              aria-label={t('hr.buttons.back')}
            >
              {isNarrow ? undefined : t('hr.buttons.back')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <ExportPdfButton
              compact={isNarrow}
              buildPdf={() => handleExportPdf()}
            />
            {showOverflowMenu ? (
              <Dropdown
                menu={{ items: overflowMenuItems }}
                trigger={['click']}
              >
                <Button
                  icon={<MoreOutlined />}
                  aria-label={t('common.actions')}
                />
              </Dropdown>
            ) : (
              <>
                {refueling.approvalRequestId ? (
                  <Button
                    onClick={() =>
                      router.push(`/approvals/${refueling.approvalRequestId}`)
                    }
                    aria-label={t('hr.buttons.viewInApprovals')}
                  >
                    {isCompact
                      ? t('nav.approvals')
                      : t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => setConfirmCancel(true)}
                    aria-label={t('hr.buttons.cancelRequest')}
                  >
                    {isCompact ? undefined : t('hr.buttons.cancelRequest')}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip">
                {refueling.requestNumber}
              </span>
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
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {vehicleTitle}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
              {refueling.submittedAt
                ? ` · ${formatProjectDate(refueling.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.fuelStation')}</p>
            <p className="erp-employee-meta-value truncate">
              {refueling.fuelStation}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.fuelType')}</p>
            <p className="erp-employee-meta-value">
              {formatFuelType(refueling.fuelType, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.litres')}</p>
            <p className="erp-employee-meta-value">
              {refueling.requestedLitres?.toString() ?? '-'}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.totalCostEtb')}</p>
            <p className="erp-employee-meta-value">
              {refueling.totalCostEtb != null
                ? formatEtbAmount(refueling.totalCostEtb)
                : '-'}
            </p>
          </div>
        </div>
      </div>

      {refueling.status === 'RETURNED' && isOwner ? (
        <ErpNotice
          tone="warning"
          className="mb-0"
          title={t('pages.hr.vehicleRefueling.returnedNotice')}
          action={
            refueling.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${refueling.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {showReceiptUpload ? (
        <ErpNotice
          tone="info"
          className="mb-0"
          title={t('hr.messages.vehicleRefuelingReceiptRequired')}
          action={
            <>
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
                size="small"
                icon={<UploadOutlined />}
                loading={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('hr.buttons.attachReceipt')}
              </Button>
            </>
          }
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.requestDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.form.vehicle')}>
                  <div className="flex items-start gap-2">
                    <Fuel
                      size={16}
                      className="mt-0.5 shrink-0 text-[#6B7280]"
                      strokeWidth={1.75}
                    />
                    <span>
                      {refueling.vehicle
                        ? `${refueling.vehicle.plateNumber} (${refueling.vehicle.make} ${refueling.vehicle.model})`
                        : t('hr.labels.noVehicle')}
                    </span>
                  </div>
                </MetaItem>
                <MetaItem label={t('hr.form.fuelDate')}>
                  {formatProjectDate(refueling.fuelDate)}
                </MetaItem>
                <MetaItem label={t('hr.form.fuelType')}>
                  {formatFuelType(refueling.fuelType, t)}
                </MetaItem>
                <MetaItem label={t('hr.form.fuelStation')}>
                  {refueling.fuelStation}
                </MetaItem>
                <MetaItem label={t('hr.form.currentMileage')}>
                  {refueling.currentMileage?.toString() ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.requestedLitres')}>
                  {refueling.requestedLitres?.toString() ?? '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.unitPriceEtb')}>
                  {refueling.unitPriceEtb != null
                    ? formatEtbAmount(refueling.unitPriceEtb)
                    : '-'}
                </MetaItem>
                <MetaItem label={t('hr.form.totalCostEtb')}>
                  {refueling.totalCostEtb != null
                    ? formatEtbAmount(refueling.totalCostEtb)
                    : '-'}
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
                {refueling.notes?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.form.notes')}>
                      <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                        {refueling.notes}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
              </div>
            </DetailSection>

            {refueling.receiptDocument ? (
              <DetailSection title={t('hr.table.receipt')}>
                <AttachmentDownloadList
                  documents={[refueling.receiptDocument]}
                  emptyLabel={t('hr.empty.noAttachments')}
                />
              </DetailSection>
            ) : null}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-4">
          {isDirectApproved || tiers.length === 0 ? (
            <div className="erp-pro-card overflow-hidden">
              <DetailSection title={t('hr.section.approvalChain')}>
                <p className="erp-users-cell-sub m-0">
                  {isDirectApproved
                    ? t('hr.messages.directApprovalNoChain')
                    : t('hr.empty.noApprovalChain')}
                </p>
              </DetailSection>
            </div>
          ) : (
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={refueling.approvalRequest?.currentTier ?? 1}
            />
          )}
        </aside>
      </div>

      <ConfirmDialog
        className="erp-hr-travel-modal"
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
