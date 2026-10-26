'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { ApiRequestError } from '@/lib/api/errors';
import { useInspectionRepair } from '@/lib/query/inspection-repair';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Inspection & Repair body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent - do not duplicate it here.
 */
export default function InspectionRepairDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useInspectionRepair(sourceId);
  const request = detailQuery.data;

  if (detailQuery.isLoading && !request) {
    return (
      <div className="erp-hr-travel-v2">
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
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
            : t('hr.messages.inspectionRepairNotFound')
        }
      />
    );
  }

  return (
    <div className="erp-hr-travel-v2 flex flex-col gap-3">
      <SummaryStrip
        items={[
          {
            label: t('hr.form.inspectionType'),
            value: t(`hr.inspectionType.${request.inspectionType}`),
          },
          {
            label: t('hr.form.urgency'),
            value: t(`hr.urgency.${request.urgency}`),
          },
          { label: t('hr.form.location'), value: request.location },
          {
            label: t('hr.form.asset'),
            value: request.asset?.serialNumber ?? '-',
          },
        ]}
      />

      <SectionCard
        title={t('hr.section.requestDetails')}
        bodyClassName="px-3 py-4 sm:px-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <MetaItem label={t('hr.form.deviceName')}>{request.deviceName}</MetaItem>
          {request.make ? (
            <MetaItem label={t('hr.form.make')}>{request.make}</MetaItem>
          ) : null}
          {request.model ? (
            <MetaItem label={t('hr.form.model')}>{request.model}</MetaItem>
          ) : null}
          {request.year != null ? (
            <MetaItem label={t('hr.form.year')}>{String(request.year)}</MetaItem>
          ) : null}
          <MetaItem label={t('hr.form.description')}>
            <p className="m-0 whitespace-pre-wrap leading-relaxed">
              {request.description}
            </p>
          </MetaItem>
          {request.solution ? (
            <MetaItem label={t('hr.form.solution')}>
              <p className="m-0 whitespace-pre-wrap leading-relaxed">
                {request.solution}
              </p>
            </MetaItem>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
