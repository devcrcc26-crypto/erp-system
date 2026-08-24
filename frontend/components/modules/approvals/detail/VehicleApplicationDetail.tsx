'use client';

import { Alert, Skeleton, Tag } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useVehicleApplication } from '@/lib/query/vehicle-application';
import {
  formatDriveType,
  formatVehicleApplicationEmployeeName,
  formatVehicleApplicationStatus,
  vehicleApplicationStatusVariant,
} from '@/lib/utils/vehicle-application-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function VehicleApplicationDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useVehicleApplication(sourceId);
  const application = detailQuery.data;

  if (detailQuery.isLoading && !application) {
    return (
      <div
        className="rounded-none p-6"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Vehicle application not found'
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-none overflow-hidden"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <div className="px-3 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
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
            {application.releasedAt ? (
              <Tag color="green">Released</Tag>
            ) : null}
          </div>
          <h2
            className="text-lg font-semibold leading-snug m-0"
            style={{ color: tokens.colorTextPrimary }}
          >
            Vehicle Application  - {application.vehicle?.plateNumber}
          </h2>
          <p
            className="mt-1 text-sm m-0"
            style={{ color: tokens.colorTextSecondary }}
          >
            Submitted by{' '}
            <span
              className="font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {formatVehicleApplicationEmployeeName(application.employee)}
            </span>
            {application.submittedAt
              ? ` · ${formatProjectDate(application.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: t('hr.labels.destination'), value: application.destination },
          { label: 'Drive Type', value: formatDriveType(application.driveType, t) },
          { label: t('hr.labels.passengers'), value: String(application.passengerCount) },
          {
            label: t('hr.labels.vehicle'),
            value: application.vehicle
              ? `${application.vehicle.plateNumber} (${application.vehicle.make} ${application.vehicle.model})`
              : t('hr.labels.noVehicle'),
          },
        ]}
      />

      <SectionCard title="Trip Details" bodyClassName="px-3 py-4 sm:px-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetaItem label={t('hr.labels.departure')}>
            {formatProjectDate(application.departureDatetime)}
          </MetaItem>
          <MetaItem label={t('hr.labels.return')}>
            {formatProjectDate(application.returnDatetime)}
          </MetaItem>
          <MetaItem label={t('hr.labels.purpose')}>
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
              {application.project.projectCode}  - {application.project.name}
            </MetaItem>
          ) : null}
          {application.notes ? (
            <MetaItem label="Notes">
              <p className="whitespace-pre-wrap leading-relaxed m-0">
                {application.notes}
              </p>
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
