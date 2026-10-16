'use client';

import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { ApiRequestError } from '@/lib/api/errors';
import { usePerDiemSettlement } from '@/lib/query/per-diem';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';

/**
 * Per diem settlement body for the Approvals inbox.
 */
export default function PerDiemSettlementDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const detailQuery = usePerDiemSettlement(sourceId);
  const settlement = detailQuery.data;

  if (detailQuery.isLoading && !settlement) {
    return (
      <div className="border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (detailQuery.isError || !settlement) {
    return (
      <Alert
        type="error"
        showIcon
        message={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Per diem settlement not found'
        }
      />
    );
  }

  const direction =
    settlement.balanceDirection === 'TO_COMPANY'
      ? 'Company'
      : settlement.balanceDirection === 'TO_EMPLOYEE'
        ? 'Employee'
        : 'None';
  const kmDifference =
    settlement.vehicleUsed &&
    settlement.kmDeparture != null &&
    settlement.kmReturn != null
      ? settlement.kmReturn - settlement.kmDeparture
      : null;

  return (
    <div className="flex flex-col gap-3">
      <SummaryStrip
        items={[
          { label: 'Actual days', value: String(settlement.actualDays) },
          { label: 'Advances', value: formatEtbAmount(settlement.totalAdvances) },
          {
            label: `Balance (${direction})`,
            value: formatEtbAmount(settlement.balance),
            emphasize: true,
          },
        ]}
      />
      <SectionCard title="Settlement" bodyClassName="px-3 py-4 sm:px-5">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <MetaItem label="Destination">{settlement.destination}</MetaItem>
          <MetaItem label="Category">{settlement.destinationCategory}</MetaItem>
          <MetaItem label="Departure">
            {formatProjectDate(settlement.actualDepartureDate)}{' '}
            {settlement.actualDepartureTime}
          </MetaItem>
          <MetaItem label="Return">
            {formatProjectDate(settlement.actualReturnDate)} {settlement.actualReturnTime}
          </MetaItem>
          <MetaItem label="Vehicle km">
            {kmDifference != null ? String(kmDifference) : '-'}
          </MetaItem>
          <MetaItem label="Per diem earned">
            {formatEtbAmount(settlement.perDiemEarned)}
          </MetaItem>
        </div>
      </SectionCard>
    </div>
  );
}
