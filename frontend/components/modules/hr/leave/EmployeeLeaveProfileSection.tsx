'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  LeaveBalance,
  LeaveRequestListItem,
  LeaveType,
} from '@/lib/api/leave.types';
import {
  useLeaveBalances,
  useLeaveRequestsAll,
  useMyLeaveBalances,
  useMyLeaveRequestsAll,
} from '@/lib/query/leave';
import { leaveHistoryPath } from '@/lib/utils/leave-history-path';
import {
  OWN_BALANCE_LEAVE_TYPES,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';

const HISTORY_PAGE_SIZE = 10;
const LOW_BALANCE_THRESHOLD = 5;

export type EmployeeLeaveProfileMode = 'self' | 'employee';

interface EmployeeLeaveProfileSectionProps {
  mode: EmployeeLeaveProfileMode;
  /** Required when mode is `employee`. */
  employeeId?: string;
  /** Hide the "New Leave Request" button (read-only My Profile). */
  hideCreateAction?: boolean;
}

const BALANCE_ACCENT: Record<string, string> = {
  ANNUAL: '#1d9e75',
  MATERNITY: '#be185d',
  SICK: '#2563eb',
};

function pickBalance(
  balances: LeaveBalance[],
  leaveType: LeaveType,
): LeaveBalance | null {
  return balances.find((row) => row.leaveType === leaveType) ?? null;
}

function LeaveProfileSection({
  title,
  action,
  children,
  bodyClassName = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}): React.ReactNode {
  return (
    <div className="erp-employee-section">
      <div className="erp-employee-section-header">
        <h3 className="erp-employee-section-title">{title}</h3>
        {action ? <div className="erp-employee-section-extra">{action}</div> : null}
      </div>
      <div className={`erp-employee-section-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function BalanceTile({
  leaveType,
  label,
  balance,
}: {
  leaveType: LeaveType;
  label: string;
  balance: LeaveBalance | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const accent = BALANCE_ACCENT[leaveType] ?? '#64748b';

  if (!balance) {
    return (
      <article className="erp-leave-balance-card erp-leave-balance-card--empty">
        <div className="erp-leave-balance-card-head">
          <span
            className="erp-leave-balance-dot"
            style={{ background: accent }}
            aria-hidden
          />
          <p className="erp-leave-balance-label">{label}</p>
        </div>
        <p className="erp-leave-balance-empty">-</p>
      </article>
    );
  }

  const pool = balance.entitled + balance.broughtForward;
  const isLow = balance.remaining <= LOW_BALANCE_THRESHOLD;
  const consumed = balance.used + balance.pending;
  // Bar shows leave used (not remaining), so 0 used → empty track.
  const usedPct =
    pool > 0
      ? Math.max(0, Math.min(100, Math.round((consumed / pool) * 100)))
      : 0;

  return (
    <article
      className={`erp-leave-balance-card${isLow ? ' erp-leave-balance-card--low' : ''}`}
    >
      <div className="erp-leave-balance-card-head">
        <span
          className="erp-leave-balance-dot"
          style={{ background: isLow ? '#ba7517' : accent }}
          aria-hidden
        />
        <p className="erp-leave-balance-label">{label}</p>
      </div>
      <p className="erp-leave-balance-value">
        <span
          className="erp-leave-balance-remaining"
          style={{ color: isLow ? '#ba7517' : '#0f172a' }}
        >
          {balance.remaining}
        </span>
        <span className="erp-leave-balance-pool">/ {pool}</span>
      </p>
      <div className="erp-leave-balance-track" aria-hidden>
        <div
          className="erp-leave-balance-fill"
          style={{
            width: `${usedPct}%`,
            background: isLow ? '#ba7517' : accent,
          }}
        />
      </div>
      <p className="erp-leave-balance-meta">
        {t('hr.leave.usedPending', {
          used: balance.used,
          pending: balance.pending,
        })}
      </p>
    </article>
  );
}

/**
 * Leave balances (current year) and leave request history for a profile surface.
 * Use `self` on My Profile; use `employee` on HR employee detail.
 */
export default function EmployeeLeaveProfileSection({
  mode,
  employeeId,
  hideCreateAction = false,
}: EmployeeLeaveProfileSectionProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [historyPage, setHistoryPage] = useState(1);

  const isSelf = mode === 'self';
  const targetEmployeeId = isSelf ? undefined : employeeId;
  const employeeEnabled = Boolean(targetEmployeeId);

  const myBalancesQuery = useMyLeaveBalances(year, isSelf);
  const employeeBalancesQuery = useLeaveBalances(
    {
      page: 1,
      limit: 1,
      year,
      employeeId: targetEmployeeId,
    },
    !isSelf && employeeEnabled,
  );

  const myHistoryQuery = useMyLeaveRequestsAll({}, isSelf);
  const employeeHistoryQuery = useLeaveRequestsAll(
    { employeeId: targetEmployeeId },
    !isSelf && employeeEnabled,
  );

  const balancesLoading = isSelf
    ? myBalancesQuery.isLoading
    : employeeBalancesQuery.isLoading;
  const balancesError = isSelf
    ? myBalancesQuery.error
    : employeeBalancesQuery.error;

  const historyLoading = isSelf
    ? myHistoryQuery.isLoading
    : employeeHistoryQuery.isLoading;
  const historyError = isSelf
    ? myHistoryQuery.error
    : employeeHistoryQuery.error;

  const displayBalances = useMemo((): Array<{
    leaveType: LeaveType;
    balance: LeaveBalance | null;
  }> => {
    if (isSelf) {
      const rows = myBalancesQuery.data ?? [];
      return OWN_BALANCE_LEAVE_TYPES.map((leaveType) => ({
        leaveType,
        balance: pickBalance(rows, leaveType),
      }));
    }

    const summary = employeeBalancesQuery.data?.data?.[0];
    return [
      { leaveType: 'ANNUAL' as const, balance: summary?.annual ?? null },
      { leaveType: 'MATERNITY' as const, balance: summary?.maternity ?? null },
      { leaveType: 'SICK' as const, balance: summary?.sick ?? null },
    ];
  }, [isSelf, myBalancesQuery.data, employeeBalancesQuery.data?.data]);

  const allHistory = useMemo(() => {
    const rows = isSelf
      ? (myHistoryQuery.data ?? [])
      : (employeeHistoryQuery.data ?? []);
    return [...rows].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [isSelf, myHistoryQuery.data, employeeHistoryQuery.data]);

  const historyMeta = useMemo(() => {
    const total = allHistory.length;
    const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE) || 1);
    const page = Math.min(historyPage, pages);
    return { total, page, limit: HISTORY_PAGE_SIZE, pages };
  }, [allHistory.length, historyPage]);

  const historyRows = useMemo(() => {
    const start = (historyMeta.page - 1) * historyMeta.limit;
    return allHistory.slice(start, start + historyMeta.limit);
  }, [allHistory, historyMeta.page, historyMeta.limit]);

  const columns: ColumnsType<LeaveRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 140,
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('hr.table.leaveType'),
        dataIndex: 'leaveType',
        key: 'leaveType',
        width: 130,
        render: (value: LeaveType) => (
          <StatusBadge
            label={formatLeaveType(value, t)}
            variant={leaveTypeVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-strong">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 72,
        align: 'right',
        render: (value: number) => (
          <span className="erp-users-cell-strong tabular-nums">{value}</span>
        ),
      },
      {
        title: t('common.status'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: string) => (
          <StatusBadge
            label={formatLeaveStatus(value, t)}
            variant={leaveStatusVariant(value)}
          />
        ),
      },
    ],
    [t],
  );

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      return error.message;
    }
    return t('hr.leave.profileLoadError');
  }

  function handleViewAll(): void {
    if (targetEmployeeId) {
      router.push(leaveHistoryPath(targetEmployeeId));
    }
  }

  function handleNewLeaveRequest(): void {
    router.push('/approvals/new/leave-request');
  }

  const historyAction = isSelf ? (
    hideCreateAction ? null : (
      <Button type="primary" size="small" onClick={handleNewLeaveRequest}>
        {t('hr.buttons.newLeaveRequest')}
      </Button>
    )
  ) : canViewHr ? (
    <Button type="link" size="small" className="!px-0" onClick={handleViewAll}>
      {t('hr.leave.viewAllHistory')}
    </Button>
  ) : null;

  if (!isSelf && !employeeId) {
    return null;
  }

  return (
    <div className="erp-leave-profile">
      <LeaveProfileSection
        title={t('hr.section.leaveBalance')}
        action={
          <div className="erp-leave-year-control">
            <span className="erp-leave-year-label">{t('hr.table.year')}</span>
            <InputNumber
              min={2000}
              max={2100}
              value={year}
              onChange={(value) => {
                if (typeof value === 'number') {
                  setYear(value);
                }
              }}
              size="small"
              className="erp-leave-year-input"
            />
          </div>
        }
      >
        {balancesError ? (
          <Alert type="error" showIcon title={errorMessage(balancesError)} />
        ) : balancesLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <div className="erp-leave-balance-grid">
            {displayBalances.map(({ leaveType, balance }) => (
              <BalanceTile
                key={leaveType}
                leaveType={leaveType}
                label={formatLeaveType(leaveType, t)}
                balance={balance}
              />
            ))}
          </div>
        )}
      </LeaveProfileSection>

      <LeaveProfileSection
        title={t('hr.leave.historyTitle')}
        action={historyAction}
        bodyClassName="!p-0"
      >
        {historyError ? (
          <div className="p-4">
            <Alert type="error" showIcon title={errorMessage(historyError)} />
          </div>
        ) : (
          <DataTable<LeaveRequestListItem>
            rowKey="id"
            size="small"
            className="erp-pro-table erp-users-table erp-leave-history-table"
            loading={historyLoading}
            columns={columns}
            dataSource={historyRows}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/leave-requests/${record.id}`),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: historyMeta.page,
              pageSize: historyMeta.limit,
              total: historyMeta.total,
              showSizeChanger: false,
              onChange: (page) => setHistoryPage(page),
            }}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CalendarDays size={28} strokeWidth={1.5} />}
                  title={t('hr.leave.noHistory')}
                />
              ),
            }}
          />
        )}
      </LeaveProfileSection>
    </div>
  );
}
