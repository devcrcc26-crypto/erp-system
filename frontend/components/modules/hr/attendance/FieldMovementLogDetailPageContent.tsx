'use client';

import { useMemo } from 'react';
import { Alert, Avatar, Button, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  ExportOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import {
  FieldMovementStatusBadge,
  FlagBadge,
  ReasonBadge,
  formatLongDate,
} from '@/components/modules/attendance/field-movement-display';
import ApprovalTierTimeline from '@/components/modules/approvals/ApprovalTierTimeline';
import DataTable from '@/components/ui/DataTable/DataTable';
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

const AVATAR_COLORS = [
  'var(--color-teal-400)',
  'var(--color-blue-400)',
  'var(--color-amber-400)',
  'var(--color-teal-600)',
  'var(--color-blue-800)',
  'var(--color-red-400)',
] as const;

function initialsOf(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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
        title: 'Original flag',
        key: 'flag',
        width: 160,
        render: (_value, entry) => <FlagBadge flag={entryFlag(entry)} />,
      },
      {
        title: 'Reason',
        key: 'reason',
        width: 160,
        render: (_value, entry) => <ReasonBadge reason={entry.reason} />,
      },
      {
        title: 'Destination',
        dataIndex: 'destination',
        key: 'destination',
        width: 160,
        ellipsis: true,
        render: (value: string | null) => value?.trim() || '—',
      },
      {
        title: 'Departure',
        dataIndex: 'departureTime',
        key: 'departureTime',
        width: 100,
        render: (value: string | null) => (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: value
                ? 'var(--color-text-primary)'
                : 'var(--color-text-tertiary)',
              letterSpacing: '0.02em',
            }}
          >
            {value ?? '—'}
          </span>
        ),
      },
      {
        title: 'Return',
        dataIndex: 'returnTime',
        key: 'returnTime',
        width: 100,
        render: (value: string | null) => (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: value
                ? 'var(--color-text-primary)'
                : 'var(--color-text-tertiary)',
              letterSpacing: '0.02em',
            }}
          >
            {value ?? '—'}
          </span>
        ),
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
        <Alert type="error" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <div
        className="erp-pro-list-page erp-users-page erp-attendance-review-page"
        aria-busy="true"
      >
        <p className="sr-only">Loading field movement log…</p>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-review-page flex flex-col gap-4">
        <div className="erp-pro-card">
          <div style={{ padding: '20px 24px' }}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push('/hr/field-movement-logs')}
              style={{ padding: '4px 8px', marginBottom: 12 }}
            >
              {t('hr.buttons.back')}
            </Button>
            <Alert
              type="error"
              showIcon
              style={{ borderRadius: 8 }}
              title={getFriendlyApiErrorMessage(
                detailQuery.error,
                t('pages.hr.fieldMovementLogs.notFound'),
                t,
              )}
            />
          </div>
        </div>
      </div>
    );
  }

  const entries = log?.entries ?? [];
  const employeeName = log?.employee ? formatUserName(log.employee) : '—';
  const employeeCode = log?.employee?.employeeId?.trim() || '—';
  const periodLabel = log
    ? `${t(`hr.months.${log.month}`)} ${log.year}`
    : '—';
  const tiers = (log?.approvalRequest?.tiers ?? []) as ApprovalTier[];
  const daysExplained = entries.length || log?.entryCount || 0;

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page erp-attendance-review-page flex flex-col gap-4">
      <div className="erp-pro-card" style={{ marginBottom: 0 }}>
        <div style={{ padding: '20px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push('/hr/field-movement-logs')}
              style={{ padding: '4px 8px' }}
              aria-label={t('common.back')}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                {log?.employee ? (
                  <Avatar
                    size={40}
                    style={{
                      background: avatarColor(log.employee.id),
                      borderRadius: 10,
                      flexShrink: 0,
                    }}
                  >
                    {initialsOf(
                      log.employee.firstName,
                      log.employee.lastName,
                    )}
                  </Avatar>
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 20,
                        fontWeight: 650,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {employeeName}
                    </h1>
                    {log ? (
                      <FieldMovementStatusBadge status={log.status} />
                    ) : null}
                  </div>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 13,
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {t('pages.hr.fieldMovementLogs.detailEyebrow')}
                    {' · '}
                    {log?.requestNumber}
                    {' · '}
                    <span className="erp-users-id-chip">{employeeCode}</span>
                    {' · '}
                    {periodLabel}
                  </p>
                </div>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexShrink: 0,
                flexWrap: 'wrap',
              }}
            >
              {log?.approvalRequestId ? (
                <Button
                  icon={<ExportOutlined />}
                  onClick={() =>
                    router.push(`/approvals/${log.approvalRequestId}`)
                  }
                >
                  {t('pages.hr.fieldMovementLogs.openInApprovals')}
                </Button>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              padding: '12px 14px',
              background: 'var(--color-surface-secondary)',
              borderRadius: 8,
              border: '1px solid var(--color-border-tertiary)',
            }}
          >
            {[
              {
                label: t('pages.hr.fieldMovementLogs.facts.period'),
                value: periodLabel,
              },
              {
                label: t('pages.hr.fieldMovementLogs.facts.daysExplained'),
                value: String(daysExplained),
              },
              {
                label: t('pages.hr.fieldMovementLogs.facts.submitted'),
                value: formatDateTime(log?.submittedAt ?? null),
              },
              {
                label: t('pages.hr.fieldMovementLogs.facts.completed'),
                value: formatDateTime(log?.completedAt ?? null),
              },
              ...(log?.currentTierLabel &&
              (log.status === 'SUBMITTED' || log.status === 'IN_REVIEW')
                ? [
                    {
                      label: t('pages.hr.fieldMovementLogs.facts.waitingOn'),
                      value: log.currentTierLabel,
                    },
                  ]
                : []),
            ].map((fact) => (
              <div key={fact.label} style={{ minWidth: 100 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-tertiary)',
                    marginBottom: 2,
                  }}
                >
                  {fact.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {fact.value}
                </div>
              </div>
            ))}
          </div>

          {log?.notes?.trim() ? (
            <Alert
              type="info"
              showIcon
              style={{ borderRadius: 8, marginTop: 12 }}
              title={t('pages.hr.fieldMovementLogs.employeeNote')}
              description={log.notes}
            />
          ) : null}
        </div>
      </div>

      <div
        className={
          tiers.length > 0
            ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]'
            : 'flex flex-col gap-4'
        }
      >
        <div className="erp-pro-card">
          <div className="erp-pro-card-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <UnorderedListOutlined
                style={{ color: 'var(--color-teal-400)' }}
              />
              <h3 className="erp-pro-card-toolbar-title">
                {t('pages.hr.fieldMovementLogs.explainedDays')}
              </h3>
              <span className="erp-users-count-pill">
                {entries.length.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="erp-pro-table-card-body">
            {entries.length === 0 ? (
              <div
                style={{
                  padding: '32px 24px',
                  textAlign: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 13,
                }}
              >
                {t('pages.hr.fieldMovementLogs.noEntries')}
              </div>
            ) : (
              <DataTable<FieldMovementLogEntry>
                rowKey="id"
                className="erp-data-table erp-pro-table erp-users-table"
                size="small"
                columns={columns}
                dataSource={entries}
                pagination={false}
                scroll={{ x: showAppliedColumn ? 1400 : 1200 }}
              />
            )}
          </div>
        </div>

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
