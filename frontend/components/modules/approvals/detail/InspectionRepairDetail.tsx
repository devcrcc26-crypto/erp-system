'use client';

import { Alert, Skeleton } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import { useInspectionRepair } from '@/lib/query/inspection-repair';
import { tokens } from '@/lib/theme/tokens';
import {
  formatInspectionRepairEmployeeName,
  formatInspectionRepairStatus,
  inspectionRepairStatusVariant,
} from '@/lib/utils/inspection-repair-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Inspection & Repair body for the Approvals detail inbox (read-only).
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
      <div
        className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6"
      >
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
            : t('hr.messages.inspectionRepairNotFound')
        }
      />
    );
  }

  const deviceLabel = request.asset
    ? `${request.asset.brand} ${request.asset.model}`.trim()
    : request.deviceName;

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
              {request.requestNumber}
            </span>
            <span style={{ color: tokens.colorBorder }}>·</span>
            <StatusBadge
              label={formatInspectionRepairStatus(request.status, t)}
              variant={inspectionRepairStatusVariant(request.status)}
            />
          </div>
          <h2
            className="m-0 text-lg font-semibold leading-snug"
            style={{ color: tokens.colorTextPrimary }}
          >
            {deviceLabel}
          </h2>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {formatInspectionRepairEmployeeName(request.employee)}
            {request.submittedAt
              ? ` · ${formatProjectDate(request.submittedAt)}`
              : null}
          </p>
        </div>
      </div>

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
            value: request.asset?.serialNumber ?? '—',
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
