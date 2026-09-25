'use client';

import { useMemo } from 'react';
import { Button, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft, ExternalLink, ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  FieldMovementStatusBadge,
  FlagBadge,
  ReasonBadge,
  formatLongDate,
} from '@/components/modules/attendance/field-movement-display';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetBreadcrumbLabel } from '@/hooks/use-set-breadcrumb-label';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import type {
  AttendanceDayFlag,
  FieldMovementLog,
  FieldMovementLogEntry,
  FieldMovementReason,
} from '@/lib/api/attendance.types';
import type { ApprovalTier } from '@/lib/api/approvals.types';
import { useFieldMovementLog } from '@/lib/query/attendance';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserName } from '@/lib/utils/user-display';

const REASON_TO_ORIGINAL_FLAG: Record<
  FieldMovementReason,
  AttendanceDayFlag
> = {
  FIELD_VISIT: 'MISSING_CLOCK_OUT',
  EARLY_LEAVE: 'EARLY_LEAVE',
  FORGOT_CLOCK_IN: 'MISSING_CLOCK_IN',
  FORGOT_CLOCK_OUT: 'MISSING_CLOCK_OUT',
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entryFlag(entry: FieldMovementLogEntry): AttendanceDayFlag {
  return entry.dailyLog?.flag && entry.dailyLog.flag !== 'NONE'
    ? entry.dailyLog.flag
    : REASON_TO_ORIGINAL_FLAG[entry.reason];
}

function appliedCorrection(
  log: FieldMovementLog,
  entry: FieldMovementLogEntry,
): string | null {
  if (log.status !== 'APPROVED') {
    return null;
  }
  const parts = [
    entry.dailyLog?.correctedClockInLocal
      ? `Clock-in set to ${entry.dailyLog.correctedClockInLocal}`
      : null,
    entry.dailyLog?.correctedClockOutLocal
      ? `Clock-out set to ${entry.dailyLog.correctedClockOutLocal}`
      : null,
    entry.dailyLog?.isEarlyLeave
      ? `Early leave confirmed (${entry.dailyLog.earlyLeaveMinutes ?? 0} min)`
      : null,
    entry.dailyLog?.flagResolved ? 'Flag resolved' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
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
  const log = detailQuery.data;

  useSetHeaderExtra(null);
  useSetBreadcrumbLabel(
    log
      ? `${log.requestNumber}${
          log.employee ? ` · ${formatUserName(log.employee)}` : ''
        }`
      : null,
  );

  const showAppliedColumn = log?.status === 'APPROVED';

  const columns = useMemo((): ColumnsType<FieldMovementLogEntry> => {
    const cols: ColumnsType<FieldMovementLogEntry> = [
      {
        title: 'Date',
        key: 'date',
        width: 180,
        fixed: 'left',
        sorter: (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime(),
        defaultSortOrder: 'ascend',
        render: (_value, entry) => formatLongDate(entry.date),
      },
      {
        title: 'Flag',
        key: 'flag',
        width: 160,
        render: (_value, entry) => <FlagBadge flag={entryFlag(entry)} />,
      },
      {
        title: 'Reason',
        key: 'reason',
        width: 150,
        render: (_value, entry) => <ReasonBadge reason={entry.reason} />,
      },
      {
        title: 'Destination',
        dataIndex: 'destination',
        key: 'destination',
        width: 180,
        ellipsis: true,
        render: (value: string | null) => value?.trim() || '—',
      },
      {
        title: 'Left at',
        dataIndex: 'departureTime',
        key: 'departureTime',
        width: 100,
        render: (value: string | null, entry) => {
          if (
            entry.reason !== 'FIELD_VISIT' &&
            entry.reason !== 'EARLY_LEAVE'
          ) {
            return '—';
          }
          return value ?? '—';
        },
      },
      {
        title: 'Returned at',
        dataIndex: 'returnTime',
        key: 'returnTime',
        width: 120,
        render: (value: string | null, entry) => {
          if (entry.reason !== 'FIELD_VISIT') {
            return '—';
          }
          return value ?? 'Did not return';
        },
      },
      {
        title: 'Recorded in / out',
        key: 'recorded',
        width: 140,
        render: (_value, entry) => {
          if (!entry.dailyLog) {
            return '—';
          }
          return `${entry.dailyLog.clockInLocal ?? '—'} / ${entry.dailyLog.clockOutLocal ?? '—'}`;
        },
      },
      {
        title: 'Notes',
        dataIndex: 'notes',
        key: 'notes',
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value?.trim() || '—',
      },
    ];

    if (showAppliedColumn && log) {
      cols.push({
        title: 'Applied to attendance',
        key: 'applied',
        width: 260,
        ellipsis: true,
        render: (_value, entry) => appliedCorrection(log, entry) ?? '—',
      });
    }

    return cols;
  }, [log, showAppliedColumn]);

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice tone="error" title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page" aria-busy="true">
        <p className="sr-only">Loading field movement log…</p>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page flex flex-col gap-4">
        <div>
          <Button
            type="text"
            icon={<ArrowLeft size={16} aria-hidden />}
            onClick={() => router.push('/hr/field-movement-logs')}
          >
            {t('hr.buttons.back')}
          </Button>
        </div>
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

  const entries = log?.entries ?? [];
  const employeeName = log?.employee ? formatUserName(log.employee) : '—';
  const periodLabel = log
    ? new Date(log.year, log.month - 1, 1).toLocaleString('en', {
        month: 'long',
        year: 'numeric',
      })
    : '—';
  const tiers = (log?.approvalRequest?.tiers ?? []) as ApprovalTier[];

  return (
    <div className="fm-page erp-pro-list-page erp-users-page erp-employee-detail-page flex flex-col gap-4">
      <header className="fm-card">
        <div className="fm-card__body">
          <div className="fm-page-header">
            <div className="min-w-0">
              <div className="mb-2">
                <Button
                  type="text"
                  icon={<ArrowLeft size={16} aria-hidden />}
                  onClick={() => router.push('/hr/field-movement-logs')}
                  aria-label={t('hr.buttons.backToList')}
                  className="-ml-2"
                >
                  {t('hr.buttons.back')}
                </Button>
              </div>
              <p className="fm-eyebrow">
                Field movement log · {log?.requestNumber}
              </p>
              <h1 className="fm-h1">{employeeName}</h1>
              <p className="fm-lead">
                {log?.employee?.employeeId
                  ? `${log.employee.employeeId} · `
                  : ''}
                {periodLabel}
              </p>
            </div>
            <div className="fm-actions items-center">
              {log ? <FieldMovementStatusBadge status={log.status} /> : null}
              {log?.approvalRequestId ? (
                <Button
                  icon={<ExternalLink size={16} aria-hidden />}
                  onClick={() =>
                    router.push(`/approvals/${log.approvalRequestId}`)
                  }
                >
                  Open in Approvals
                </Button>
              ) : null}
            </div>
          </div>

          <dl className="fm-facts">
            <div>
              <dt>Period</dt>
              <dd>{periodLabel}</dd>
            </div>
            <div>
              <dt>Days explained</dt>
              <dd>{entries.length || log?.entryCount || 0}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{formatDateTime(log?.submittedAt ?? null)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{formatDateTime(log?.completedAt ?? null)}</dd>
            </div>
            {log?.currentTierLabel &&
            (log.status === 'SUBMITTED' || log.status === 'IN_REVIEW') ? (
              <div>
                <dt>Waiting on</dt>
                <dd>{log.currentTierLabel}</dd>
              </div>
            ) : null}
          </dl>

          {log?.notes?.trim() ? (
            <p className="fm-quote">
              <span className="fm-quote__label">Note from the employee</span>
              {log.notes}
            </p>
          ) : null}
        </div>
      </header>

      <div
        className={
          tiers.length > 0
            ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]'
            : 'flex flex-col gap-4'
        }
      >
        <section aria-labelledby="fm-entries-title" className="fm-card">
          <div className="fm-card__body !p-0">
            <div className="flex items-center gap-2 border-b border-[var(--fm-border,#E5E7EB)] px-4 py-3">
              <ListChecks
                size={18}
                aria-hidden
                className="text-[var(--fm-accent)]"
              />
              <h2 id="fm-entries-title" className="fm-card__title m-0">
                Explained days ({entries.length})
              </h2>
            </div>

            {entries.length === 0 ? (
              <p className="fm-results-line px-4 py-6">
                This log has no entries.
              </p>
            ) : (
              <DataTable<FieldMovementLogEntry>
                rowKey="id"
                className="erp-pro-table erp-users-table"
                size="small"
                columns={columns}
                dataSource={entries}
                pagination={false}
                scroll={{ x: showAppliedColumn ? 1400 : 1200 }}
              />
            )}
          </div>
        </section>

        {tiers.length > 0 && log ? (
          <aside aria-label="Approval progress">
            <ApprovalTierTimeline
              tiers={tiers}
              currentTier={log.approvalRequest?.currentTier ?? 0}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
