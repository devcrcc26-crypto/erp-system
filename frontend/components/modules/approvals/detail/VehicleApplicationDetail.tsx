'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { ApiRequestError } from '@/lib/api/errors';
import { useVehicleApplication } from '@/lib/query/vehicle-application';
import { formatDriveType } from '@/lib/utils/vehicle-application-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Vehicle application body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
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
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
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
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
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
              {application.project.projectCode} - {application.project.name}
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
