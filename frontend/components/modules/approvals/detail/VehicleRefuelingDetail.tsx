'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useVehicleRefueling } from '@/lib/query/vehicle-refueling';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatVehicleRefuelingEmployeeName } from '@/lib/utils/vehicle-refueling-display';

/**
 * Vehicle refueling body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function VehicleRefuelingDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useVehicleRefueling(sourceId);
  const refueling = detailQuery.data;

  if (detailQuery.isLoading && !refueling) {
    return (
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !refueling) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : t('hr.messages.vehicleRefuelingNotFound')
        }
      />
    );
  }

  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
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
            value: refueling.requestedLitres?.toString() ?? '-',
          },
          {
            label: t('hr.form.unitPriceEtb'),
            value:
              refueling.unitPriceEtb != null
                ? formatEtbAmount(refueling.unitPriceEtb)
                : '-',
          },
          {
            label: t('hr.labels.totalCostEtb'),
            value:
              refueling.totalCostEtb != null
                ? formatEtbAmount(refueling.totalCostEtb)
                : '-',
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
  );
}
