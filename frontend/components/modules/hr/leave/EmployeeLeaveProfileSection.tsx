'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, InputNumber, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanCreateLeave, useCanViewHr } from '@/hooks/use-auth-capabilities';
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
import { tokens } from '@/lib/theme/tokens';

const HISTORY_PAGE_SIZE = 10;
const LOW_BALANCE_THRESHOLD = 5;

export type EmployeeLeaveProfileMode = 'self' | 'employee';

interface EmployeeLeaveProfileSectionProps {
  mode: EmployeeLeaveProfileMode;
  /** Required when mode is `employee`. */
  employeeId?: string;
}

function pickBalance(
  balances: LeaveBalance[],
  leaveType: LeaveType,
): LeaveBalance | null {
  return balances.find((row) => row.leaveType === leaveType) ?? null;
}

function BalanceTile({
  label,
  balance,
}: {
  label: string;
  balance: LeaveBalance | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (!balance) {
    return (
      <div
        className="rounded-md p-3"
        style={{
          border: `1px solid ${tokens.colorBorder}`,
          background: tokens.colorPageBg,
        }}
      >
        <p
          className="m-0 text-xs font-medium uppercase tracking-wide"
          style={{ color: tokens.colorTextTertiary }}
        >
          {label}
        </p>
        <p
          className="m-0 mt-2 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          —
        </p>
      </div>
    );
  }

  const isLow = balance.remaining <= LOW_BALANCE_THRESHOLD;
  const pool = balance.entitled + balance.broughtForward;

  return (
    <div
      className="rounded-md p-3"
      style={{
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <p
        className="m-0 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p className="m-0 mt-2">
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: isLow ? '#BA7517' : tokens.colorTextPrimary }}
        >
          {balance.remaining}
        </span>
        <span
          className="ml-1 text-sm"
          style={{ color: tokens.colorTextTertiary }}
        >
          / {pool}
        </span>
      </p>
      <p
        className="m-0 mt-1 text-xs"
        style={{ color: tokens.colorTextSecondary }}
      >
        {t('hr.leave.usedPending', {
          used: balance.used,
          pending: balance.pending,
        })}
      </p>
    </div>
  );
}

/**
 * Leave balances (current year) and leave request history for a profile surface.
 * Use `self` on My Profile; use `employee` on HR employee detail.
 */
export default function EmployeeLeaveProfileSection({
  mode,
  employeeId,
}: EmployeeLeaveProfileSectionProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canCreateLeave = useCanCreateLeave();
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
  }, [
    isSelf,
    myBalancesQuery.data,
    employeeBalancesQuery.data?.data,
  ]);

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
          <span className="font-medium tabular-nums">{value}</span>
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
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 72,
        align: 'right',
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
    canCreateLeave ? (
      <Button
        type="primary"
        size="small"
        onClick={handleNewLeaveRequest}
        style={{ borderRadius: 2 }}
      >
        {t('hr.buttons.newLeaveRequest')}
      </Button>
    ) : null
  ) : canViewHr ? (
    <Button type="link" size="small" className="!px-0" onClick={handleViewAll}>
      {t('hr.leave.viewAllHistory')}
    </Button>
  ) : null;

  if (!isSelf && !employeeId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard
        title={t('hr.section.leaveBalance')}
        bodyClassName="p-4"
        action={
          <div className="flex items-center gap-2">
            <span
              className="text-xs"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('hr.table.year')}
            </span>
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
              style={{ width: 96 }}
            />
          </div>
        }
      >
        {balancesError ? (
          <Alert
            type="error"
            showIcon
            title={errorMessage(balancesError)}
          />
        ) : balancesLoading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {displayBalances.map(({ leaveType, balance }) => (
              <BalanceTile
                key={leaveType}
                label={formatLeaveType(leaveType, t)}
                balance={balance}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('hr.leave.historyTitle')}
        bodyClassName="p-0"
        action={historyAction}
      >
        {historyError ? (
          <div className="p-4">
            <Alert
              type="error"
              showIcon
              title={errorMessage(historyError)}
            />
          </div>
        ) : (
          <DataTable<LeaveRequestListItem>
            rowKey="id"
            size="small"
            loading={historyLoading}
            columns={columns}
            dataSource={historyRows}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/leave-requests/${record.id}`),
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
                <TableEmptyState title={t('hr.leave.noHistory')} />
              ),
            }}
          />
        )}
      </SectionCard>
    </div>
  );
}
