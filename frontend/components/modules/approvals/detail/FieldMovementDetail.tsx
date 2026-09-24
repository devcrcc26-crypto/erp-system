'use client';

import { Alert, Skeleton, Tag } from 'antd';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  AttendanceDayFlag,
  FieldMovementReason,
} from '@/lib/api/attendance.types';
import { useFieldMovementLog } from '@/lib/query/attendance';
import { formatUserName } from '@/lib/utils/user-display';

const FLAG_LABELS: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure detected',
  NONE: 'None',
};

const REASON_LABELS: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

function formatEntryDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  });
}

/**
 * Field movement body for the Approvals detail inbox (read-only).
 * Header is rendered by ApprovalDetailPageContent — do not duplicate it here.
 */
export default function FieldMovementDetail({
  sourceId,
}: {
  approvalRequestId: string;
  sourceId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const detailQuery = useFieldMovementLog(sourceId);
  const log = detailQuery.data;

  if (detailQuery.isLoading && !log) {
    return (
      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-6">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (detailQuery.isError || !log) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          detailQuery.error instanceof ApiRequestError
            ? detailQuery.error.message
            : 'Field movement log not found'
        }
      />
    );
  }

  const periodLabel = new Date(log.year, log.month - 1, 1).toLocaleString(
    'en',
    { month: 'long', year: 'numeric' },
  );
  const employeeName = log.employee
    ? formatUserName(log.employee)
    : '—';
  const employeeCode = log.employee?.employeeId
    ? ` (${log.employee.employeeId})`
    : '';

  return (
    <div className="flex flex-col gap-3">
      <SummaryStrip
        items={[
          {
            label: 'Employee',
            value: `${employeeName}${employeeCode}`,
          },
          {
            label: 'Period',
            value: periodLabel,
          },
          {
            label: 'Log number',
            value: log.requestNumber,
          },
          {
            label: 'Entries',
            value: String(log.entries?.length ?? log.entryCount ?? 0),
          },
        ]}
      />

      <SectionCard title={`Entries (${log.entries?.length ?? 0} days)`}>
        <div className="erp-drawer-list">
          {(log.entries ?? []).map((entry) => {
            const flag = (entry.dailyLog?.flag ?? 'NONE') as AttendanceDayFlag;
            return (
              <div
                key={entry.id}
                className="border-b border-[#E5E7EB] px-3 py-3 last:border-b-0"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#1A1A1A]">
                    {formatEntryDate(entry.date)}
                  </span>
                  <Tag>{FLAG_LABELS[flag] ?? flag}</Tag>
                </div>
                <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  <MetaItem label="Reason">
                    {REASON_LABELS[entry.reason] ?? entry.reason}
                  </MetaItem>
                  {entry.reason === 'FIELD_VISIT' ? (
                    <MetaItem label="Destination">
                      {entry.destination?.trim() || '—'}
                    </MetaItem>
                  ) : null}
                  <MetaItem label="Departed">
                    {entry.departureTime ?? '—'}
                  </MetaItem>
                  <MetaItem label="Returned">
                    {entry.returnTime ?? '—'}
                  </MetaItem>
                  <MetaItem label="Notes">
                    {entry.notes?.trim() || '—'}
                  </MetaItem>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={t('hr.table.notes') || 'Overall notes'}>
        <p className="m-0 text-sm text-[#6B7280]">
          {log.notes?.trim() || '—'}
        </p>
      </SectionCard>
    </div>
  );
}
