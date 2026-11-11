'use client';

import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { ApiRequestError } from '@/lib/api/errors';
import { usePerDiemRequest } from '@/lib/query/per-diem';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import PerDiemRateSummary from '@/components/modules/hr/per-diem/PerDiemRateSummary';

/**
 * Per diem request body for the Approvals detail inbox.
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function PerDiemDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
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
      <SummaryStrip
        items={[
          { label: 'Days', value: String(request.days) },
          {
            label: 'Daily Rate',
            value: formatEtbAmount(request.dailyRate),
          },
          ...(request.requestedDailyRate != null
            ? [{ label: 'Requested Rate', value: formatEtbAmount(request.requestedDailyRate) }]
            : []),
          ...(request.approvedDailyRate != null
            ? [{ label: 'Approved Rate', value: formatEtbAmount(request.approvedDailyRate), emphasize: true }]
            : []),
          {
            label: 'Total (ETB)',
            value: formatEtbAmount(request.totalAmountEtb),
            emphasize: !request.approvedDailyRate,
          },
        ]}
      />

      <PerDiemRateSummary request={request} />

      <SectionCard title="Request Details" bodyClassName="px-3 py-4 sm:px-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <MetaItem label="Trip type">
            {request.tripType === 'SITE_DEPLOYMENT' ? 'Site deployment' : 'Travel'}
          </MetaItem>
          <MetaItem label="Destination Category">
            {request.destinationCategory}
          </MetaItem>
          <MetaItem label="Departure time">{request.departureTime ?? '-'}</MetaItem>
          <MetaItem label="Return time">{request.returnTime ?? '-'}</MetaItem>
          <MetaItem label="PV number">{request.pvNumber ?? '-'}</MetaItem>
          <MetaItem label="PV date">
            {request.pvDate ? formatProjectDate(request.pvDate) : '-'}
          </MetaItem>
          <MetaItem label="Dates">
            {formatProjectDate(request.startDate)}  - {formatProjectDate(request.endDate)}
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
