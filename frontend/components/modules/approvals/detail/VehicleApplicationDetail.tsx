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

/**
 * Vehicle application body for the Approvals detail inbox (read-only).
 */
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
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !application) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.vehicleApplicationNotFound')
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
            {application.directApproved ? (
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
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {formatVehicleApplicationEmployeeName(application.employee)}
            {application.submittedAt
              ? ` · ${formatProjectDate(application.submittedAt)}`
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
            <MetaItem label={t('hr.form.passengerNames')}>
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
  );
}
