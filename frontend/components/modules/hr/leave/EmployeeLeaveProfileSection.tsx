'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ProfileContractPeriodSelect from '@/components/modules/profile/ProfileContractPeriodSelect';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useProfileContractPeriod } from '@/hooks/use-profile-contract-period';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  LeaveBalance,
  LeaveRequestListItem,
  LeaveType,
} from '@/lib/api/leave.types';
import {
  useLeaveRequestsAll,
  useMyLeaveBalances,
  useMyLeaveRequestsAll,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { leaveBalanceTypesForGender } from '@/lib/utils/leave-balance-access';
import {
  leaveDaysInContractPeriod,
  requestOverlapsContractPeriod,
  type ProfileContractPeriod,
} from '@/lib/utils/contract-period';
import { leaveRequestDetailHref } from '@/lib/utils/hr-self-service-nav';
import { leaveHistoryPath } from '@/lib/utils/leave-history-path';
import {
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
  /**
   * When provided by the parent profile shell, reuse that contract period
   * instead of rendering a local period control.
   */
  contractPeriod?: ProfileContractPeriod | null;
  contractPeriods?: ProfileContractPeriod[];
  contractPeriodLoading?: boolean;
  onContractPeriodChange?: (contractId: string) => void;
  /** Hide the local period select when the parent already shows one. */
  hidePeriodControl?: boolean;
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
  const remaining = balance?.remaining ?? 0;
  const isLow = balance != null && remaining <= LOW_BALANCE_THRESHOLD;

  return (
    <article className="erp-leave-balance-card">
      <div className="erp-leave-balance-card-head">
        <span
          className="erp-leave-balance-dot"
          style={{ background: accent }}
          aria-hidden
        />
        <p className="erp-leave-balance-label">{label}</p>
      </div>
      <p className="erp-leave-balance-value">
        <span
          className="erp-leave-balance-remaining"
          style={{ color: isLow ? '#b42318' : accent }}
        >
          {balance != null ? remaining : '—'}
        </span>
        {balance != null ? (
          <span className="erp-leave-balance-unit">
            {t('hr.leave.daysRemaining')}
          </span>
        ) : null}
      </p>
      <p className="erp-leave-balance-meta">
        {balance == null
          ? t('hr.leave.noBalance')
          : t('hr.leave.usedPending', {
              used: balance.used,
              pending: balance.pending,
            })}
      </p>
    </article>
  );
}

/**
 * Leave balances (selected contract period) and leave request history for a profile.
 * Use `self` on My Profile; use `employee` on HR employee detail.
 */
export default function EmployeeLeaveProfileSection({
  mode,
  employeeId,
  hideCreateAction = false,
  contractPeriod: contractPeriodProp,
  contractPeriods: contractPeriodsProp,
  contractPeriodLoading: contractPeriodLoadingProp,
  onContractPeriodChange,
  hidePeriodControl = false,
}: EmployeeLeaveProfileSectionProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const currentUser = useCurrentUser();
  const [historyPage, setHistoryPage] = useState(1);

  const isSelf = mode === 'self';
  const targetEmployeeId = isSelf ? undefined : employeeId;
  const employeeEnabled = Boolean(targetEmployeeId);
  const sectionEnabled = isSelf || employeeEnabled;

  const localPeriod = useProfileContractPeriod({
    mode,
    employeeId: targetEmployeeId,
    enabled: sectionEnabled && contractPeriodProp === undefined,
  });

  const selectedPeriod =
    contractPeriodProp !== undefined
      ? contractPeriodProp
      : localPeriod.selected;
  const periodOptions =
    contractPeriodsProp ?? localPeriod.periods;
  const periodsLoading =
    contractPeriodLoadingProp ?? localPeriod.isLoading;

  const detailReturnTo = useMemo((): string => {
    if (isSelf) {
      return '/profile?tab=leave';
    }
    if (targetEmployeeId) {
      return `/users/${encodeURIComponent(targetEmployeeId)}?tab=leave`;
    }
    return '/profile?tab=leave';
  }, [isSelf, targetEmployeeId]);

  const balancesQuery = useMyLeaveBalances(
    {
      ...(selectedPeriod
        ? { forDate: selectedPeriod.startDate }
        : {}),
      employeeId: targetEmployeeId,
    },
    sectionEnabled && (selectedPeriod != null || !periodsLoading),
  );

  const myHistoryQuery = useMyLeaveRequestsAll({}, isSelf);
  const employeeHistoryQuery = useLeaveRequestsAll(
    { employeeId: targetEmployeeId },
    !isSelf && employeeEnabled,
  );

  const balancesLoading = balancesQuery.isLoading || periodsLoading;
  const balancesError = balancesQuery.error;

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
    const rows = balancesQuery.data ?? [];
    const types = leaveBalanceTypesForGender(
      isSelf ? currentUser.data?.gender : undefined,
    );
    const withMaternity =
      !types.includes('MATERNITY') &&
      rows.some((row) => row.leaveType === 'MATERNITY')
        ? ([...types, 'MATERNITY'] as const)
        : types;
    return withMaternity.map((leaveType) => ({
      leaveType,
      balance: pickBalance(rows, leaveType),
    }));
  }, [balancesQuery.data, isSelf, currentUser.data?.gender]);

  const allHistory = useMemo(() => {
    const rows = isSelf
      ? (myHistoryQuery.data ?? [])
      : (employeeHistoryQuery.data ?? []);
    const filtered =
      selectedPeriod != null
        ? rows
            .map((row) => {
              const daysInPeriod = leaveDaysInContractPeriod(
                row,
                selectedPeriod,
              );
              return { row, daysInPeriod };
            })
            .filter(
              ({ row, daysInPeriod }) =>
                daysInPeriod > 0 &&
                requestOverlapsContractPeriod(row, selectedPeriod),
            )
        : rows.map((row) => ({ row, daysInPeriod: row.days }));
    return filtered
      .sort(
        (a, b) =>
          new Date(b.row.createdAt).getTime() -
          new Date(a.row.createdAt).getTime(),
      )
      .map(({ row, daysInPeriod }) => ({
        ...row,
        days: daysInPeriod,
      }));
  }, [
    isSelf,
    myHistoryQuery.data,
    employeeHistoryQuery.data,
    selectedPeriod,
  ]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedPeriod?.id]);

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

  const periodControl =
    hidePeriodControl ? null : (
      <ProfileContractPeriodSelect
        periods={periodOptions}
        value={selectedPeriod?.id ?? null}
        loading={periodsLoading}
        onChange={(id) => {
          if (onContractPeriodChange) {
            onContractPeriodChange(id);
          } else {
            localPeriod.setSelectedId(id);
          }
        }}
      />
    );

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
        action={periodControl}
      >
        {balancesError ? (
          <Alert type="error" showIcon title={errorMessage(balancesError)} />
        ) : balancesLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : periodOptions.length === 0 && !periodsLoading ? (
          <Alert
            type="info"
            showIcon
            title={t('hr.leave.noContractPeriods')}
          />
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
        bodyClassName="erp-employee-section-body--flush"
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
              onClick: () =>
                router.push(
                  leaveRequestDetailHref(record.id, detailReturnTo),
                ),
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
