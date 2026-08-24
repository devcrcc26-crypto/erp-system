'use client';

import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { usePerDiemRequest } from '@/lib/query/per-diem';
import { formatCurrencyAmount, formatEtbAmount } from '@/lib/utils/expense-claim-display';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Per diem request body for the Approvals detail inbox.
 */
export default function PerDiemDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = usePerDiemRequest(sourceId);
  const request = detailQuery.data;

  if (detailQuery.isLoading && !request) {
    return (
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !request) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Per diem request not found'
        }
      />
    );
  }

  const linkedTravel = request.linkedFlight
    ? `Flight ${request.linkedFlight.applicationNumber} - ${request.linkedFlight.destination}`
    : request.linkedTrip
      ? `Business Trip ${request.linkedTrip.tripNumber} - ${request.linkedTrip.destinationCity}, ${request.linkedTrip.destinationCountry}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="bg-white rounded-none border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <div className="px-3 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              {request.requestNumber}
            </span>
            <span className="text-[var(--color-border-secondary)]">·</span>
            <StatusBadge
              label={formatPerDiemStatus(request.status, t)}
              variant={perDiemStatusVariant(request.status)}
            />
          </div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] leading-snug m-0">
            {request.destination}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Submitted by{' '}
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatPerDiemEmployeeName(request.employee)}
            </span>
            {request.submittedAt
              ? ` · ${formatProjectDate(request.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

      <SummaryStrip
        items={[
          { label: 'Days', value: String(request.days) },
          {
            label: 'Daily Rate',
            value: formatCurrencyAmount(request.dailyRate, request.currency),
          },
          {
            label: 'Total (ETB)',
            value: formatEtbAmount(request.totalAmountEtb),
            emphasize: true,
          },
        ]}
      />

      <SectionCard title="Request Details" bodyClassName="px-3 py-4 sm:px-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <MetaItem label="Destination Category">
            {request.destinationCategory}
          </MetaItem>
          <MetaItem label="Dates">
            {formatProjectDate(request.startDate)} �?{formatProjectDate(request.endDate)}
          </MetaItem>
          {linkedTravel ? (
            <div className="col-span-1 sm:col-span-2">
              <MetaItem label="Linked Travel">{linkedTravel}</MetaItem>
            </div>
          ) : null}
          {request.notes ? (
            <div className="col-span-1 sm:col-span-2">
              <MetaItem label="Notes">
                <p className="whitespace-pre-wrap leading-relaxed m-0">
                  {request.notes}
                </p>
              </MetaItem>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
