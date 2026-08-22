'use client';

import { Alert, Skeleton, Tag } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useVehicleRefueling } from '@/lib/query/vehicle-refueling';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
      <div
        className="rounded-lg p-6"
        style={{
          background: tokens.colorCardBg,
          border: `1px solid ${tokens.colorBorder}`,
        }}
      >
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !refueling) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Vehicle refueling request not found'
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg overflow-hidden"
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
              {refueling.requestNumber}
            </span>
            <span style={{ color: tokens.colorBorder }}>·</span>
            <StatusBadge
              label={formatVehicleRefuelingStatus(refueling.status, t)}
              variant={vehicleRefuelingStatusVariant(refueling.status)}
            />
            {refueling.receiptDocumentId ? (
              <Tag color="green">Receipt attached</Tag>
            ) : null}
          </div>
          <h2
            className="text-lg font-semibold leading-snug m-0"
            style={{ color: tokens.colorTextPrimary }}
          >
            Vehicle Refueling — {refueling.vehicle?.plateNumber}
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
              {formatVehicleRefuelingEmployeeName(refueling.employee)}
            </span>
            {refueling.submittedAt
              ? ` · ${formatProjectDate(refueling.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: 'Station', value: refueling.fuelStation },
          { label: t('hr.labels.fuelType'), value: formatFuelType(refueling.fuelType, t) },
          { label: 'Litres', value: refueling.requestedLitres?.toString() ?? '-' },
          { label: 'Cost (ETB)', value: refueling.estimatedCostEtb?.toString() ?? '-' },
        ]}
      />

      <SectionCard title="Refueling Details" bodyClassName="px-3 py-4 sm:px-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetaItem label="Fuel Date">
            {formatProjectDate(refueling.fuelDate)}
          </MetaItem>
          <MetaItem label="Current Mileage (km)">
            {refueling.currentMileage?.toString() ?? '-'}
          </MetaItem>
          <MetaItem label="Vehicle">
            {refueling.vehicle
              ? `${refueling.vehicle.plateNumber} — ${refueling.vehicle.make} ${refueling.vehicle.model}`
              : '-'}
          </MetaItem>
          {refueling.driver ? (
            <MetaItem label="Driver">
              {formatVehicleRefuelingEmployeeName(refueling.driver)}
            </MetaItem>
          ) : null}
          {refueling.notes ? (
            <MetaItem label="Notes">
              <p className="whitespace-pre-wrap leading-relaxed m-0">
                {refueling.notes}
              </p>
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
