'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Popconfirm, Skeleton, Tag, Typography } from 'antd';
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

export default function VehicleApplicationDetailPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
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
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (detailQuery.isError || !application) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Vehicle application not found'
        }
        action={
          <Button onClick={() => router.push('/hr/vehicle-applications')}>
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
          onClick={() => router.push('/hr/vehicle-applications')}
        >
          Back
        </Button>
        {canRelease ? (
          <Popconfirm
            title="Release vehicle?"
            description="The vehicle will be marked as available for other bookings."
            onConfirm={() => void handleRelease()}
            okButtonProps={{ loading: releaseMutation.isPending }}
          >
            <Button type="primary" className="ml-auto">
              Release Vehicle
            </Button>
          </Popconfirm>
        ) : null}
        {canCancel ? (
          <Button
            danger
            className={canRelease ? '' : 'ml-auto'}
            onClick={() => setConfirmCancel(true)}
          >
            Cancel Application
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
                  {application.applicationNumber}
                </span>
                <span style={{ color: tokens.colorBorder }}>|</span>
                <StatusBadge
                  label={formatVehicleApplicationStatus(application.status)}
                  variant={vehicleApplicationStatusVariant(application.status)}
                />
                {isDirectApproved ? (
                  <Tag color="blue">Direct approval</Tag>
                ) : null}
                {application.releasedAt ? (
                  <Tag color="green">Released</Tag>
                ) : null}
              </div>
              <h2
                className="text-lg font-semibold leading-snug m-0"
                style={{ color: tokens.colorTextPrimary }}
              >
                Vehicle Application - {application.vehicle?.plateNumber}
              </h2>
              <p
                className="mt-1 text-sm m-0"
                style={{ color: tokens.colorTextSecondary }}
              >
                {formatVehicleApplicationEmployeeName(application.employee)}
                {application.submittedAt
                  ? ` | Submitted ${formatProjectDate(application.submittedAt)}`
                  : null}
              </p>
            </div>
          </div>

          <SummaryStrip
            items={[
              { label: 'Destination', value: application.destination },
              {
                label: 'Drive Type',
                value: formatDriveType(application.driveType),
              },
              {
                label: 'Passengers',
                value: String(application.passengerCount),
              },
              {
                label: 'Vehicle',
                value: application.vehicle
                  ? `${application.vehicle.plateNumber} (${application.vehicle.make} ${application.vehicle.model})`
                  : '-',
              },
            ]}
          />

          <SectionCard title="Trip Details" bodyClassName="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetaItem label="Departure">
                {formatProjectDate(application.departureDatetime)}
              </MetaItem>
              <MetaItem label="Return">
                {formatProjectDate(application.returnDatetime)}
              </MetaItem>
              <MetaItem label="Purpose">
                <p className="whitespace-pre-wrap leading-relaxed m-0">
                  {application.purpose}
                </p>
              </MetaItem>
              {application.passengerNames ? (
                <MetaItem label="Passenger Names">
                  <p className="whitespace-pre-wrap leading-relaxed m-0">
                    {application.passengerNames}
                  </p>
                </MetaItem>
              ) : null}
              {application.project ? (
                <MetaItem label="Project">
                  {application.project.projectCode} - {application.project.name}
                </MetaItem>
              ) : null}
              {application.notes ? (
                <MetaItem label="Notes">
                  <p className="whitespace-pre-wrap leading-relaxed m-0">
                    {application.notes}
                  </p>
                </MetaItem>
              ) : null}
              {application.releasedAt ? (
                <MetaItem label="Released At">
                  {formatProjectDate(application.releasedAt)}
                </MetaItem>
              ) : null}
            </div>
          </SectionCard>
        </div>

        <div className="min-w-0">
          <SectionCard title="Approval Chain" bodyClassName="px-4 py-4">
            {isDirectApproved ? (
              <Typography.Text type="secondary">
                Approved directly - no approval required
              </Typography.Text>
            ) : tiers.length > 0 ? (
              <ApprovalTierTimeline
                tiers={tiers}
                currentTier={application.approvalRequest?.currentTier ?? 1}
              />
            ) : (
              <Typography.Text type="secondary">
                No approval chain yet
              </Typography.Text>
            )}
          </SectionCard>
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
