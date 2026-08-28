'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Popconfirm, Skeleton, Space, Tag, Typography } from 'antd';
import { ArrowLeft } from 'lucide-react';
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
  useCancelVehicleApplication,
  useReleaseVehicleApplication,
  useVehicleApplication,
} from '@/lib/query/vehicle-application';
import { useCurrentUser } from '@/lib/query/profile';
import {
  formatDriveType,
  formatVehicleApplicationEmployeeName,
  formatVehicleApplicationStatus,
  vehicleApplicationStatusVariant,
} from '@/lib/utils/vehicle-application-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Vehicle application detail with trip summary, release, and approval chain.
 */
export default function VehicleApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const currentUser = useCurrentUser();
  const detailQuery = useVehicleApplication(applicationId);
  const cancelMutation = useCancelVehicleApplication(applicationId);
  const releaseMutation = useReleaseVehicleApplication(applicationId);

  const [confirmCancel, setConfirmCancel] = useState(false);

  const application = detailQuery.data;
  const isOwner =
    Boolean(application) && application?.employeeId === currentUser.data?.id;
  const canCancel =
    isOwner &&
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
      messageApi.success('Vehicle application cancelled');
      setConfirmCancel(false);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to cancel application', messageApi);
    }
  }

  async function handleRelease(): Promise<void> {
    try {
      await releaseMutation.mutateAsync();
      messageApi.success('Vehicle released successfully');
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to release vehicle', messageApi);
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

  if (detailQuery.isError || !application) {
    return (
      <div className="erp-pro-list-page flex flex-col gap-3">
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : 'Vehicle application not found'
          }
          action={
            <Button
              onClick={() => router.push('/hr/vehicle-applications')}
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
          onClick={() => router.push('/hr/vehicle-applications')}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.back')}
        </Button>
        <Space wrap size={8} className="ml-auto">
          {canRelease ? (
            <Popconfirm
              title={t('hr.labels.releaseVehicle')}
              description={t('hr.labels.releaseVehicleDesc')}
              onConfirm={() => void handleRelease()}
              okButtonProps={{ loading: releaseMutation.isPending }}
            >
              <Button type="primary" style={{ borderRadius: 0 }}>
                {t('hr.buttons.releaseVehicle')}
              </Button>
            </Popconfirm>
          ) : null}
          {canCancel ? (
            <Button
              danger
              onClick={() => setConfirmCancel(true)}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.cancel')}
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
                  {application.applicationNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>·</span>
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
              <h2
                className="m-0 text-lg font-semibold leading-snug"
                style={{ color: tokens.colorTextPrimary }}
              >
                {t('pages.hr.vehicleApplication.detail')} —{' '}
                {application.vehicle?.plateNumber ?? t('hr.labels.noVehicle')}
              </h2>
              <p
                className="m-0 mt-1 text-sm"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatVehicleApplicationEmployeeName(application.employee)}
                {application.submittedAt
                  ? ` · Submitted ${formatProjectDate(application.submittedAt)}`
                  : null}
              </p>
            </div>
          </div>

          <SummaryStrip
            items={[
              {
                label: t('hr.labels.destination'),
                value: application.destination,
              },
              {
                label: t('hr.form.driveType'),
                value: formatDriveType(application.driveType, t),
              },
              {
                label: t('hr.labels.passengers'),
                value: String(application.passengerCount),
              },
              {
                label: t('hr.labels.vehicle'),
                value: application.vehicle
                  ? `${application.vehicle.plateNumber} (${application.vehicle.make} ${application.vehicle.model})`
                  : t('hr.labels.noVehicle'),
              },
            ]}
          />

          <SectionCard
            title={t('hr.section.tripDetails')}
            bodyClassName="px-3 py-4 sm:px-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <MetaItem label={t('hr.labels.departure')}>
                {formatProjectDate(application.departureDatetime)}
              </MetaItem>
              <MetaItem label={t('hr.labels.return')}>
                {formatProjectDate(application.returnDatetime)}
              </MetaItem>
              <MetaItem label={t('hr.labels.purpose')}>
                <p className="m-0 whitespace-pre-wrap leading-relaxed">
                  {application.purpose}
                </p>
              </MetaItem>
              {application.passengerNames ? (
                <MetaItem label={t('hr.labels.passengers')}>
                  <p className="m-0 whitespace-pre-wrap leading-relaxed">
                    {application.passengerNames}
                  </p>
                </MetaItem>
              ) : null}
              {application.project ? (
                <MetaItem label={t('hr.labels.project')}>
                  {application.project.projectCode} — {application.project.name}
                </MetaItem>
              ) : null}
              {application.notes ? (
                <MetaItem label={t('hr.labels.notes')}>
                  <p className="m-0 whitespace-pre-wrap leading-relaxed">
                    {application.notes}
                  </p>
                </MetaItem>
              ) : null}
              {application.releasedAt ? (
                <MetaItem label={t('hr.labels.releasedAt')}>
                  {formatProjectDate(application.releasedAt)}
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>
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
              currentTier={application.approvalRequest?.currentTier ?? 1}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel application?"
        description="This will cancel the vehicle application and any open approval request."
        confirmLabel="Cancel Application"
        danger
        confirmLoading={cancelMutation.isPending}
        onConfirm={() => void handleCancel()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
