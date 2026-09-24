'use client';

import { Button, Skeleton, Tag } from 'antd';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type {
  AttendanceDayFlag,
  FieldMovementReason,
  FieldMovementStatus,
} from '@/lib/api/attendance.types';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { useFieldMovementLog } from '@/lib/query/attendance';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserName } from '@/lib/utils/user-display';

const FLAG_LABELS: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure detected',
  NONE: 'None',
};

const REASON_TO_ORIGINAL_FLAG: Record<
  FieldMovementReason,
  AttendanceDayFlag
> = {
  FIELD_VISIT: 'MISSING_CLOCK_OUT',
  EARLY_LEAVE: 'EARLY_LEAVE',
  FORGOT_CLOCK_IN: 'MISSING_CLOCK_IN',
  FORGOT_CLOCK_OUT: 'MISSING_CLOCK_OUT',
};

const REASON_LABELS: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

function statusVariant(status: FieldMovementStatus): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'info';
    case 'RETURNED':
      return 'warning';
    default:
      return 'default';
  }
}

function formatStatus(status: FieldMovementStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatEntryDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  });
}

function DetailSection({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header flex flex-wrap items-center justify-between gap-2">
        <h3 className="erp-employee-section-title m-0">{title}</h3>
        {action}
      </div>
      <div className="erp-employee-section-body">{children}</div>
    </div>
  );
}

/**
 * HR detail for one field movement / early departure log.
 */
export default function FieldMovementLogDetailPageContent({
  logId,
}: {
  logId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const detailQuery = useFieldMovementLog(logId, canViewHr);

  useSetHeaderExtra(
    <Button
      icon={<ArrowLeft size={16} />}
      onClick={() => router.push('/hr/field-movement-logs')}
    >
      Back
    </Button>,
  );

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="error" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            'Field movement log not found',
            t,
          )}
        />
      </div>
    );
  }

  const log = detailQuery.data;
  const employeeName = log.employee ? formatUserName(log.employee) : '—';
  const periodLabel = new Date(log.year, log.month - 1, 1).toLocaleString(
    'en',
    { month: 'long', year: 'numeric' },
  );
  const tiers = (log.approvalRequest?.tiers ?? []) as ApprovalTier[];

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-detail-page flex flex-col gap-4">
      <div className="erp-employee-hero rounded-xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
              {log.requestNumber}
            </p>
            <h1 className="m-0 mt-1 text-xl font-semibold text-[#1A1A1A]">
              {employeeName}
            </h1>
            <p className="m-0 mt-1 text-sm text-[#6B7280]">
              {log.employee?.employeeId
                ? `${log.employee.employeeId} · `
                : ''}
              {periodLabel}
            </p>
          </div>
          <StatusBadge
            label={formatStatus(log.status)}
            variant={statusVariant(log.status)}
          />
        </div>
      </div>

      <DetailSection title="Summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetaItem label="Period">{periodLabel}</MetaItem>
          <MetaItem label="Entries">
            {String(log.entries?.length ?? log.entryCount ?? 0)}
          </MetaItem>
          <MetaItem label="Submitted">
            {log.submittedAt
              ? new Date(log.submittedAt).toLocaleString('en-GB')
              : '—'}
          </MetaItem>
          <MetaItem label="Completed">
            {log.completedAt
              ? new Date(log.completedAt).toLocaleString('en-GB')
              : '—'}
          </MetaItem>
        </div>
        {log.notes?.trim() ? (
          <p className="mt-3 mb-0 text-sm text-[#6B7280]">{log.notes}</p>
        ) : null}
      </DetailSection>

      <DetailSection title={`Entries (${log.entries?.length ?? 0})`}>
        <div className="erp-drawer-list">
          {(log.entries ?? []).map((entry) => {
            const flag = (
              entry.dailyLog?.flag && entry.dailyLog.flag !== 'NONE'
                ? entry.dailyLog.flag
                : REASON_TO_ORIGINAL_FLAG[entry.reason]
            ) as AttendanceDayFlag;
            const appliedCorrection =
              log.status === 'APPROVED'
                ? [
                    entry.dailyLog?.correctedClockInLocal
                      ? `Clock-in → ${entry.dailyLog.correctedClockInLocal}`
                      : null,
                    entry.dailyLog?.correctedClockOutLocal
                      ? `Clock-out → ${entry.dailyLog.correctedClockOutLocal}`
                      : null,
                    entry.dailyLog?.isEarlyLeave
                      ? `Early leave confirmed (${entry.dailyLog.earlyLeaveMinutes ?? 0} min)`
                      : null,
                    entry.dailyLog?.flagResolved ? 'Flag resolved' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : null;

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
                  <Tag color="blue">
                    {REASON_LABELS[entry.reason] ?? entry.reason}
                  </Tag>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {entry.destination ? (
                    <MetaItem label="Destination">{entry.destination}</MetaItem>
                  ) : null}
                  <MetaItem label="Departure">
                    {entry.departureTime ?? '—'}
                  </MetaItem>
                  <MetaItem label="Return">
                    {entry.returnTime ?? '—'}
                  </MetaItem>
                  <MetaItem label="Notes">
                    {entry.notes?.trim() || '—'}
                  </MetaItem>
                </div>
                {appliedCorrection ? (
                  <p className="mt-2 mb-0 text-xs text-[#1d9e75]">
                    Applied: {appliedCorrection}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </DetailSection>

      {tiers.length > 0 ? (
        <DetailSection title="Approval timeline">
          <ApprovalTierTimeline tiers={tiers} />
        </DetailSection>
      ) : null}

      {log.approvalRequestId ? (
        <div>
          <Button
            type="link"
            className="!px-0"
            onClick={() =>
              router.push(`/approvals/${log.approvalRequestId}`)
            }
          >
            Open in Approvals
          </Button>
        </div>
      ) : null}
    </div>
  );
}
