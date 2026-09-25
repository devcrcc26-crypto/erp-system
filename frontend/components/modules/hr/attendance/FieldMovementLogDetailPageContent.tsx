'use client';

import { Button, Skeleton } from 'antd';
import { ArrowLeft, CircleCheck, ExternalLink, ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DateTile,
  FieldMovementStatusBadge,
  FlagBadge,
  ReasonBadge,
  formatLongDate,
} from '@/components/modules/attendance/field-movement-display';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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

function entryTone(log: FieldMovementLog): string {
  if (log.status === 'APPROVED') {
    return 'ready';
  }
  if (log.status === 'REJECTED' || log.status === 'CANCELLED') {
    return 'plain';
  }
  return 'pending';
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
      icon={<ArrowLeft size={16} aria-hidden />}
      onClick={() => router.push('/hr/field-movement-logs')}
    >
      Back to logs
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
      <div className="erp-pro-list-page erp-users-page" aria-busy="true">
        <p className="sr-only">Loading field movement log…</p>
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
  const entries = log.entries ?? [];
  const employeeName = log.employee ? formatUserName(log.employee) : '—';
  const periodLabel = new Date(log.year, log.month - 1, 1).toLocaleString(
    'en',
    { month: 'long', year: 'numeric' },
  );
  const tiers = (log.approvalRequest?.tiers ?? []) as ApprovalTier[];
  const tone = entryTone(log);

  return (
    <div className="fm-page erp-pro-list-page erp-users-page erp-employee-detail-page flex flex-col gap-4">
      <header className="fm-card">
        <div className="fm-card__body">
          <div className="fm-page-header">
            <div className="min-w-0">
              <p className="fm-eyebrow">
                Field movement log · {log.requestNumber}
              </p>
              <h1 className="fm-h1">{employeeName}</h1>
              <p className="fm-lead">
                {log.employee?.employeeId
                  ? `${log.employee.employeeId} · `
                  : ''}
                {periodLabel}
              </p>
            </div>
            <div className="fm-actions items-center">
              <FieldMovementStatusBadge status={log.status} />
              {log.approvalRequestId ? (
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
              <dd>{entries.length || log.entryCount || 0}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{formatDateTime(log.submittedAt)}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{formatDateTime(log.completedAt)}</dd>
            </div>
            {log.currentTierLabel &&
            (log.status === 'SUBMITTED' || log.status === 'IN_REVIEW') ? (
              <div>
                <dt>Waiting on</dt>
                <dd>{log.currentTierLabel}</dd>
              </div>
            ) : null}
          </dl>

          {log.notes?.trim() ? (
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
        <section aria-labelledby="fm-entries-title" className="fm-stack">
          <div className="flex items-center gap-2">
            <ListChecks size={18} aria-hidden className="text-[var(--fm-accent)]" />
            <h2 id="fm-entries-title" className="fm-card__title">
              Explained days ({entries.length})
            </h2>
          </div>

          {entries.length === 0 ? (
            <p className="fm-results-line">This log has no entries.</p>
          ) : (
            <ul className="fm-day-list">
              {entries.map((entry) => {
                const correction = appliedCorrection(log, entry);
                const recordedIn = entry.dailyLog?.clockInLocal;
                const recordedOut = entry.dailyLog?.clockOutLocal;
                return (
                  <li key={entry.id} className={`fm-day fm-day--${tone}`}>
                    <div className="fm-day__header">
                      <DateTile date={entry.date} />
                      <div className="fm-day__main">
                        <h3 className="fm-day__title">
                          {formatLongDate(entry.date)}
                        </h3>
                        <div className="fm-badge-row">
                          <FlagBadge flag={entryFlag(entry)} />
                          <ReasonBadge reason={entry.reason} />
                        </div>
                      </div>
                    </div>
                    <div className="fm-day__content fm-stack">
                      <dl className="fm-facts">
                        {entry.destination ? (
                          <div>
                            <dt>Destination</dt>
                            <dd>{entry.destination}</dd>
                          </div>
                        ) : null}
                        {entry.reason === 'FIELD_VISIT' ||
                        entry.reason === 'EARLY_LEAVE' ? (
                          <div>
                            <dt>Left at</dt>
                            <dd>{entry.departureTime ?? '—'}</dd>
                          </div>
                        ) : null}
                        {entry.reason === 'FIELD_VISIT' ? (
                          <div>
                            <dt>Returned at</dt>
                            <dd>{entry.returnTime ?? 'Did not return'}</dd>
                          </div>
                        ) : null}
                        {entry.dailyLog ? (
                          <div>
                            <dt>Recorded clock-in / out</dt>
                            <dd>
                              {recordedIn ?? '—'} / {recordedOut ?? '—'}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {entry.notes?.trim() ? (
                        <p className="fm-quote">
                          <span className="fm-quote__label">
                            {entry.reason === 'EARLY_LEAVE'
                              ? 'Reason for leaving early'
                              : 'Notes'}
                          </span>
                          {entry.notes}
                        </p>
                      ) : null}
                      {correction ? (
                        <p className="fm-note fm-note--success">
                          <CircleCheck
                            size={16}
                            aria-hidden
                            className="mt-0.5 shrink-0"
                          />
                          <span>
                            <strong>Applied to attendance:</strong> {correction}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {tiers.length > 0 ? (
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
