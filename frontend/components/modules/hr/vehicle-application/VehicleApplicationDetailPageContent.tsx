'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Grid,
  Skeleton,
  Tag,
} from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined, StopOutlined } from '@ant-design/icons';
import { ArrowLeft, Car } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import {
  openVehicleApplicationPdf,
  useCancelVehicleApplication,
  useReleaseVehicleApplication,
  useVehicleApplication,
} from '@/lib/query/vehicle-application';
import ExportPdfButton from '@/components/modules/hr/import-export/ExportPdfButton';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatDriveType,
  formatVehicleApplicationEmployeeName,
  formatVehicleApplicationStatus,
  vehicleApplicationStatusVariant,
} from '@/lib/utils/vehicle-application-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

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
 * Vehicle application detail - Users / employee profile chrome.
 */
export default function VehicleApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const currentUser = useCurrentUser();
  const detailQuery = useVehicleApplication(applicationId);
  const cancelMutation = useCancelVehicleApplication(applicationId);
  const releaseMutation = useReleaseVehicleApplication(applicationId);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);

  useSetHeaderExtra(null);

  const application = detailQuery.data;
  const isOwner =
    Boolean(application) && application?.employeeId === currentUser.data?.id;
  const canCancel =
    Boolean(isOwner) &&
    (application?.status === 'DRAFT' || application?.status === 'SUBMITTED');
  const canRelease =
    application?.status === 'APPROVED' && !application?.releasedAt;
  const isDirectApproved = Boolean(application?.directApproved);

  const tiers = useMemo(
    () => (application?.approvalRequest?.tiers ?? []) as ApprovalTier[],
    [application?.approvalRequest?.tiers],
  );

  async function handleCancel(): Promise<void> {
    try {
      await cancelMutation.mutateAsync();
      messageApi.success(t('hr.messages.vehicleApplicationCancelled'));
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.vehicleApplicationCancelFailed'),
        messageApi,
        t,
      );
    }
  }

  async function handleRelease(): Promise<void> {
    try {
      await releaseMutation.mutateAsync();
      messageApi.success(t('hr.messages.vehicleReleased'));
      setConfirmRelease(false);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.vehicleReleaseFailed'),
        messageApi,
        t,
      );
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-vehicle-application-detail-page ${DETAIL_PAGE_V2}`}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}>
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('hr.messages.vehicleApplicationNotFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/hr/vehicle-applications')}>
              {t('hr.buttons.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const employeeName = formatVehicleApplicationEmployeeName(
    application.employee,
  );
  const vehicleTitle = application.vehicle
    ? `${application.vehicle.plateNumber} · ${application.vehicle.make} ${application.vehicle.model}`
    : t('hr.labels.noVehicle');
  const backHref = '/hr/vehicle-applications';

  const overflowMenuItems: MenuProps['items'] = [];
  if (application.approvalRequestId) {
    overflowMenuItems.push({
      key: 'approvals',
      label: t('hr.buttons.viewInApprovals'),
      onClick: () =>
        router.push(`/approvals/${application.approvalRequestId}`),
    });
  }
  if (canRelease) {
    overflowMenuItems.push({
      key: 'release',
      label: t('hr.buttons.releaseVehicle'),
      onClick: () => setConfirmRelease(true),
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
    if (!application) return;
    await openVehicleApplicationPdf(application.id);
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-vehicle-application-detail-page ${DETAIL_PAGE_V2}`}>
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
                {application.approvalRequestId ? (
                  <Button
                    onClick={() =>
                      router.push(
                        `/approvals/${application.approvalRequestId}`,
                      )
                    }
                    aria-label={t('hr.buttons.viewInApprovals')}
                  >
                    {isCompact
                      ? t('nav.approvals')
                      : t('hr.buttons.viewInApprovals')}
                  </Button>
                ) : null}
                {canRelease ? (
                  <Button
                    type="primary"
                    onClick={() => setConfirmRelease(true)}
                    aria-label={t('hr.buttons.releaseVehicle')}
                  >
                    {t('hr.buttons.releaseVehicle')}
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
                {application.applicationNumber}
              </span>
              <StatusBadge
                label={formatVehicleApplicationStatus(application.status, t)}
                variant={vehicleApplicationStatusVariant(application.status)}
              />
              {isDirectApproved ? (
                <Tag color="blue">{t('hr.labels.directApproval')}</Tag>
              ) : null}
              {application.releasedAt ? (
                <Tag color="green">{t('hr.labels.released')}</Tag>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {vehicleTitle}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {employeeName}
              {application.submittedAt
                ? ` · ${formatProjectDate(application.submittedAt)}`
                : null}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.labels.destination')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {application.destination}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.form.driveType')}</p>
            <p className="erp-employee-meta-value">
              {formatDriveType(application.driveType, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('hr.labels.passengers')}
            </p>
            <p className="erp-employee-meta-value">
              {application.passengerCount}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.labels.departure')}</p>
            <p className="erp-employee-meta-value">
              {formatProjectDate(application.departureDatetime)}
            </p>
          </div>
        </div>
      </div>

      {application.status === 'RETURNED' && isOwner ? (
        <ErpNotice
          tone="warning"
          className="mb-0"
          title={t('pages.hr.vehicleApplication.returnedNotice')}
          action={
            application.approvalRequestId ? (
              <Button
                size="small"
                onClick={() =>
                  router.push(`/approvals/${application.approvalRequestId}`)
                }
              >
                {t('hr.buttons.viewInApprovals')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 lg:grid-cols-[1fr_300px]">
        <div className="erp-pro-card min-w-0 overflow-hidden">
          <div className="erp-employee-tab-panel erp-contract-detail-body">
            <DetailSection title={t('hr.section.tripDetails')}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <MetaItem label={t('hr.labels.vehicle')}>
                  <div className="flex items-start gap-2">
                    <Car
                      size={16}
                      className="mt-0.5 shrink-0 text-[#6B7280]"
                      strokeWidth={1.75}
                    />
                    <span>
                      {application.vehicle
                        ? `${application.vehicle.plateNumber} (${application.vehicle.make} ${application.vehicle.model})`
                        : t('hr.labels.noVehicle')}
                    </span>
                  </div>
                </MetaItem>
                <MetaItem label={t('hr.form.driveType')}>
                  {formatDriveType(application.driveType, t)}
                </MetaItem>
                <MetaItem label={t('hr.labels.departure')}>
                  {formatProjectDate(application.departureDatetime)}
                </MetaItem>
                <MetaItem label={t('hr.labels.return')}>
                  {formatProjectDate(application.returnDatetime)}
                </MetaItem>
                <MetaItem label={t('hr.labels.destination')}>
                  {application.destination}
                </MetaItem>
                <MetaItem label={t('hr.labels.passengers')}>
                  {application.passengerCount}
                </MetaItem>
                {application.driver ? (
                  <MetaItem label={t('hr.labels.driver')}>
                    {formatVehicleApplicationEmployeeName(application.driver)}
                  </MetaItem>
                ) : null}
                {application.project ? (
                  <MetaItem label={t('hr.labels.project')}>
                    {application.project.projectCode} -{' '}
                    {application.project.name}
                  </MetaItem>
                ) : null}
                <div className="md:col-span-2">
                  <MetaItem label={t('hr.labels.purpose')}>
                    <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                      {application.purpose}
                    </p>
                  </MetaItem>
                </div>
                {application.passengerNames?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.form.passengerNames')}>
                      <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                        {application.passengerNames}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
                {application.notes?.trim() ? (
                  <div className="md:col-span-2">
                    <MetaItem label={t('hr.labels.notes')}>
                      <p className="m-0 whitespace-pre-wrap break-words leading-relaxed">
                        {application.notes}
                      </p>
                    </MetaItem>
                  </div>
                ) : null}
                {application.releasedAt ? (
                  <MetaItem label={t('hr.labels.releasedAt')}>
                    {formatProjectDate(application.releasedAt)}
                  </MetaItem>
                ) : null}
              </div>
            </DetailSection>
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
              currentTier={application.approvalRequest?.currentTier ?? 1}
            />
          )}
        </aside>
      </div>

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={confirmRelease}
        title={t('hr.labels.releaseVehicle')}
        description={t('hr.labels.releaseVehicleDesc')}
        confirmLabel={t('hr.buttons.releaseVehicle')}
        confirmLoading={releaseMutation.isPending}
        onConfirm={() => void handleRelease()}
        onCancel={() => setConfirmRelease(false)}
      />

      <ConfirmDialog
        className="erp-hr-travel-modal"
        open={confirmCancel}
        title={t('hr.dialog.cancelVehicleApplicationTitle')}
        description={t('hr.dialog.cancelVehicleApplicationDesc')}
        confirmLabel={t('hr.buttons.cancelRequest')}
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
