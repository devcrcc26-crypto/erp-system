'use client';

import './field-movement-logs-v2.css';
import { useMemo } from 'react';
import { Alert, Avatar, Button, Skeleton } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, ExportOutlined } from '@ant-design/icons';
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
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
    return '-';
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
        width: 220,
        render: (_value, entry) => <FlagBadge flag={entryFlag(entry)} />,
      },
      {
        title: 'Reason',
        key: 'reason',
        width: 190,
        render: (_value, entry) => <ReasonBadge reason={entry.reason} />,
      },
      {
        title: 'Destination',
        dataIndex: 'destination',
        key: 'destination',
        width: 160,
        ellipsis: true,
        render: (value: string | null) => value?.trim() || '-',
      },
      {
        title: 'Departure / out',
        dataIndex: 'departureTime',
        key: 'departureTime',
        width: 120,
        render: (value: string | null) =>
          value ? (
            <span className="erp-fml-time">{value}</span>
          ) : (
            <span className="erp-fml-dash">-</span>
          ),
      },
      {
        // Return time; for "forgot to clock in" it holds the stated clock-in.
        title: 'Return / in',
        dataIndex: 'returnTime',
        key: 'returnTime',
        width: 120,
        render: (value: string | null) =>
          value ? (
            <span className="erp-fml-time">{value}</span>
          ) : (
            <span className="erp-fml-dash">-</span>
          ),
      },
      {
        title: 'Notes',
        dataIndex: 'notes',
        key: 'notes',
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value?.trim() || '-',
      },
    ];

    if (showAppliedColumn && log) {
      cols.push({
        title: 'Applied to attendance',
        key: 'applied',
        width: 260,
        ellipsis: true,
        render: (_value, entry) => appliedCorrection(log, entry) ?? '-',
      });
    }

    return cols;
  }, [log, showAppliedColumn]);

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2">
        <Alert type="error" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <div
        className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2"
        aria-busy="true"
      >
        <p className="sr-only">Loading field movement log…</p>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2">
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
  const employeeName = log?.employee ? formatUserName(log.employee) : '-';
  const employeeCode = log?.employee?.employeeId?.trim() || '-';
  const periodLabel = log
    ? `${t(`hr.months.${log.month}`)} ${log.year}`
    : '-';
  const tiers = (log?.approvalRequest?.tiers ?? []) as ApprovalTier[];
  const daysExplained = entries.length || log?.entryCount || 0;

  const facts: Array<{ key: string; label: string; value: string; waiting?: boolean }> = [
    {
      key: 'period',
      label: t('pages.hr.fieldMovementLogs.facts.period'),
      value: periodLabel,
    },
    {
      key: 'days',
      label: t('pages.hr.fieldMovementLogs.facts.daysExplained'),
      value: String(daysExplained),
    },
    {
      key: 'submitted',
      label: t('pages.hr.fieldMovementLogs.facts.submitted'),
      value: formatDateTime(log?.submittedAt ?? null),
    },
    {
      key: 'completed',
      label: t('pages.hr.fieldMovementLogs.facts.completed'),
      value: formatDateTime(log?.completedAt ?? null),
    },
    ...(log?.currentTierLabel &&
    (log.status === 'SUBMITTED' || log.status === 'IN_REVIEW')
      ? [
          {
            key: 'waiting',
            label: t('pages.hr.fieldMovementLogs.facts.waitingOn'),
            value: log.currentTierLabel,
            waiting: true,
          },
        ]
      : []),
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-attendance-page fm-page erp-fml-v2">
      <section className="erp-pro-card erp-fml-hero">
        <Link href="/hr/field-movement-logs" className="erp-fml-back">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          {t('pages.hr.fieldMovementLogs.listTitle')}
        </Link>
        <div className="erp-fml-hero-top">
          <div className="erp-fml-identity">
            {log?.employee ? (
              <Avatar
                className="erp-users-avatar"
                style={{ background: avatarColor(log.employee.id) }}
              >
                {initialsOf(log.employee.firstName, log.employee.lastName)}
              </Avatar>
            ) : null}
            <div className="min-w-0">
              <div className="erp-fml-title-row">
                <h1 className="erp-fml-title">{employeeName}</h1>
                {log ? <FieldMovementStatusBadge status={log.status} /> : null}
              </div>
              <p className="erp-fml-meta">
                <span>{log?.requestNumber}</span>
                <span className="erp-users-id-chip">{employeeCode}</span>
                <span>{periodLabel}</span>
              </p>
              {log?.submittedOnBehalf && log.creator ? (
                <p className="m-0 mt-1 text-[13px] text-slate-600">
                  {t('pages.hr.fieldMovementLogs.submittedOnBehalf', {
                    name: formatUserName(log.creator),
                  })}
                </p>
              ) : null}
            </div>
          </div>
          {log?.approvalRequestId ? (
            <div className="erp-fml-hero-actions">
              <Button
                icon={<ExportOutlined />}
                onClick={() => router.push(`/approvals/${log.approvalRequestId}`)}
              >
                {t('pages.hr.fieldMovementLogs.openInApprovals')}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="erp-fml-facts">
          {facts.map((fact) => (
            <div
              key={fact.key}
              className={`erp-fml-fact${fact.waiting ? ' erp-fml-fact--waiting' : ''}`}
            >
              <p className="erp-fml-fact-label">{fact.label}</p>
              <p className="erp-fml-fact-value">{fact.value}</p>
            </div>
          ))}
        </div>

        {log?.notes?.trim() ? (
          <div className="erp-fml-note">
            <MessageSquareText
              size={18}
              strokeWidth={2}
              className="erp-fml-note-icon"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="erp-fml-note-title">
                {t('pages.hr.fieldMovementLogs.employeeNote')}
              </p>
              <p className="erp-fml-note-text">{log.notes}</p>
            </div>
          </div>
        ) : null}
      </section>

      <div className={`erp-fml-body${tiers.length > 0 ? '' : ' erp-fml-body--single'}`}>
        <section className="erp-pro-card erp-fml-entries">
          <div className="erp-pro-card-toolbar erp-users-toolbar">
            <div className="flex items-center gap-2.5">
              <h3 className="erp-pro-card-toolbar-title">
                {t('pages.hr.fieldMovementLogs.explainedDays')}
              </h3>
              <span className="erp-users-count-pill">
                {entries.length.toLocaleString()}
              </span>
            </div>
          </div>
          {entries.length === 0 ? (
            <div className="erp-fml-empty">
              <p className="erp-fml-empty-text">
                {t('pages.hr.fieldMovementLogs.noEntries')}
              </p>
            </div>
          ) : (
            <DataTable<FieldMovementLogEntry>
              rowKey="id"
              className="erp-data-table erp-pro-table erp-users-table"
              size="small"
              columns={columns}
              dataSource={entries}
              pagination={false}
              scroll={{ x: showAppliedColumn ? 1500 : 1300 }}
            />
          )}
        </section>

        {tiers.length > 0 && log ? (
          <aside className="erp-fml-chain" aria-label="Approval progress">
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
