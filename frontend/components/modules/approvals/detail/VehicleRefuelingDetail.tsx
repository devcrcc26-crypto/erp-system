'use client';

import { Alert, Skeleton, Tag } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import AttachmentDownloadList from '@/components/ui/FileUploadInput/AttachmentDownloadList';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { useVehicleRefueling } from '@/lib/query/vehicle-refueling';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import { tokens } from '@/lib/theme/tokens';

/**
 * Vehicle refueling body for the Approvals detail inbox (read-only).
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
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
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

  const isDirectApproved =
    refueling.status === 'APPROVED' && !refueling.approvalRequestId;

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
              {refueling.requestNumber}
            </span>
            <span style={{ color: tokens.colorBorder }}>·</span>
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
          <h2
            className="m-0 text-lg font-semibold leading-snug"
            style={{ color: tokens.colorTextPrimary }}
          >
            {t('pages.hr.vehicleRefueling.detail')} —{' '}
            {refueling.vehicle?.plateNumber ?? t('hr.labels.noVehicle')}
          </h2>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {formatVehicleRefuelingEmployeeName(refueling.employee)}
            {refueling.submittedAt
              ? ` · ${formatProjectDate(refueling.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

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
            value: refueling.requestedLitres?.toString() ?? '—',
          },
          {
            label: t('hr.form.unitPriceEtb'),
            value:
              refueling.unitPriceEtb != null
                ? formatEtbAmount(refueling.unitPriceEtb)
                : '—',
          },
          {
            label: t('hr.labels.totalCostEtb'),
            value:
              refueling.totalCostEtb != null
                ? formatEtbAmount(refueling.totalCostEtb)
                : '—',
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
            {refueling.currentMileage?.toString() ?? '—'}
          </MetaItem>
          <MetaItem label={t('hr.form.vehicle')}>
            {refueling.vehicle
              ? `${refueling.vehicle.plateNumber} — ${refueling.vehicle.make} ${refueling.vehicle.model}`
              : '—'}
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
