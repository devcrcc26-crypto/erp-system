'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  InputNumber,
  Select,
  Skeleton,
  Spin,
  type TableProps,
} from 'antd';
import { ArrowLeft, CalendarDays, Wallet } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import '@/components/modules/users/employees-v2.css';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import {
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useTablePagination,
  withControlledSort,
} from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  LeaveBalance,
  LeaveRequestListItem,
  LeaveRequestStatus,
  LeaveType,
} from '@/lib/api/leave.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useLeaveBalances,
  useLeaveRequestsAll,
  useMyLeaveBalances,
  useMyLeaveRequestsAll,
} from '@/lib/query/leave';
import { useCurrentUser } from '@/lib/query/profile';
import { useUser } from '@/lib/query/users';
import {
  OWN_BALANCE_LEAVE_TYPES,
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { leaveRequestDetailHref } from '@/lib/utils/hr-self-service-nav';
import {
  leaveHistoryPath,
  myLeaveHistoryPath,
} from '@/lib/utils/leave-history-path';
import { formatProjectDate } from '@/lib/utils/project-display';
import { sortLeaveRequests } from '@/lib/utils/table-sort';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

// No LIST_PAGE_V2: employees-v2.css carries the brand look and the
// utilities' !important rules would override it.
const HISTORY_ROOT =
  'erp-pro-list-page erp-users-page erp-employees-v2 flex flex-col';
const HISTORY_PAGE_SIZE = 15;
const LOW_BALANCE_THRESHOLD = 5;

export type LeaveHistoryPageMode = 'self' | 'employee';

interface LeaveHistoryPageContentProps {
  mode: LeaveHistoryPageMode;
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
          -
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
 * Independent leave balance + leave history page for one employee (or self).
 */
export default function LeaveHistoryPageContent({
  mode,
  employeeId,
}: LeaveHistoryPageContentProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const currentUserQuery = useCurrentUser();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { params, resetPage, bindMeta, handleTableChange, sortBy, sortOrder } =
    useTablePagination({
      initialPageSize: HISTORY_PAGE_SIZE,
      initialSortBy: 'createdAt',
      initialSortOrder: 'desc',
    });
  const [statusFilter, setStatusFilter] = useState<
    LeaveRequestStatus | undefined
  >();
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<LeaveType | undefined>();

  const isSelf = mode === 'self';
  const targetEmployeeId = isSelf ? undefined : employeeId;
  const employeeEnabled = Boolean(targetEmployeeId);
  const isOwnEmployeePage =
    !isSelf &&
    Boolean(targetEmployeeId) &&
    targetEmployeeId === currentUserQuery.data?.id;

  const allowed = isSelf || canViewHr || isOwnEmployeePage;

  const detailReturnTo = useMemo((): string => {
    if (isSelf) {
      return myLeaveHistoryPath();
    }
    if (targetEmployeeId) {
      return leaveHistoryPath(targetEmployeeId);
    }
    return myLeaveHistoryPath();
  }, [isSelf, targetEmployeeId]);

  const employeeQuery = useUser(
    targetEmployeeId ?? '',
    !isSelf && employeeEnabled && allowed,
  );

  // TODO: re-enable when leave balances are verified — also fetch for isSelf / non-HR
  const myBalancesQuery = useMyLeaveBalances(year, false);
  const employeeBalancesQuery = useLeaveBalances(
    {
      page: 1,
      limit: 1,
      year,
      employeeId: targetEmployeeId,
    },
    !isSelf && employeeEnabled && canViewHr && allowed,
  );
  const ownBalancesAsEmployeeQuery = useMyLeaveBalances(year, false);
  const showBalances = canViewHr && !isSelf;

  const myHistoryQuery = useMyLeaveRequestsAll({}, isSelf && allowed);
  const employeeHistoryQuery = useLeaveRequestsAll(
    { employeeId: targetEmployeeId },
    !isSelf && employeeEnabled && canViewHr && allowed,
  );
  const ownHistoryAsEmployeeQuery = useMyLeaveRequestsAll(
    {},
    Boolean(isOwnEmployeePage && !canViewHr && allowed),
  );

  const balancesQuery = isSelf
    ? myBalancesQuery
    : canViewHr
      ? employeeBalancesQuery
      : ownBalancesAsEmployeeQuery;
  const historyQuery = isSelf
    ? myHistoryQuery
    : canViewHr
      ? employeeHistoryQuery
      : ownHistoryAsEmployeeQuery;

  const displayName = useMemo(() => {
    if (isSelf) {
      const me = currentUserQuery.data;
      return me ? formatUserName(me) : t('pages.hr.leaveHistory.you');
    }
    if (employeeQuery.data) {
      return formatUserName(employeeQuery.data);
    }
    const summary = employeeBalancesQuery.data?.data?.[0]?.employee;
    if (summary) {
      return formatLeaveEmployeeName(summary);
    }
    return t('hr.placeholder.employee');
  }, [
    isSelf,
    currentUserQuery.data,
    employeeQuery.data,
    employeeBalancesQuery.data?.data,
    t,
  ]);

  const balancesLoading = balancesQuery.isLoading;
  const balancesError = balancesQuery.error;

  const displayBalances = useMemo((): Array<{
    leaveType: LeaveType;
    balance: LeaveBalance | null;
  }> => {
    if (canViewHr && !isSelf) {
      const summary = employeeBalancesQuery.data?.data?.[0];
      return [
        { leaveType: 'ANNUAL' as const, balance: summary?.annual ?? null },
        {
          leaveType: 'MATERNITY' as const,
          balance: summary?.maternity ?? null,
        },
        {
          leaveType: 'PATERNITY' as const,
          balance: summary?.paternity ?? null,
        },
      ];
    }

    const rows: LeaveBalance[] = Array.isArray(balancesQuery.data)
      ? balancesQuery.data
      : [];
    return OWN_BALANCE_LEAVE_TYPES.map((leaveType) => ({
      leaveType,
      balance: pickBalance(rows, leaveType),
    }));
  }, [
    canViewHr,
    isSelf,
    employeeBalancesQuery.data?.data,
    balancesQuery.data,
  ]);

  const allHistory = useMemo(
    () => historyQuery.data ?? [],
    [historyQuery.data],
  );

  const filteredHistory = useMemo(() => {
    return allHistory.filter((row) => {
      if (statusFilter && row.status !== statusFilter) {
        return false;
      }
      if (leaveTypeFilter && row.leaveType !== leaveTypeFilter) {
        return false;
      }
      return true;
    });
  }, [allHistory, statusFilter, leaveTypeFilter]);

  const sortedHistory = useMemo(
    () => sortLeaveRequests(filteredHistory, sortBy, sortOrder),
    [filteredHistory, sortBy, sortOrder],
  );

  const historyMeta: PaginationMeta = useMemo(() => {
    const total = sortedHistory.length;
    const limit = params.limit ?? HISTORY_PAGE_SIZE;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [sortedHistory.length, params.limit, params.page]);

  const historyRows = useMemo(() => {
    const start = (historyMeta.page - 1) * historyMeta.limit;
    return sortedHistory.slice(start, start + historyMeta.limit);
  }, [sortedHistory, historyMeta.page, historyMeta.limit]);

  const leaveTypeOptions = useMemo(
    () =>
      (
        [
          'ANNUAL',
          'SICK',
          'UNPAID',
          'MATERNITY',
          'PATERNITY',
          'EMERGENCY',
          'COMPASSIONATE',
          'STUDY',
          'EXAM',
        ] as LeaveType[]
      ).map((value) => ({
        value,
        label: formatLeaveType(value, t),
      })),
    [t],
  );

  const statusOptions = useMemo(
    () =>
      (
        [
          'DRAFT',
          'SUBMITTED',
          'IN_REVIEW',
          'APPROVED',
          'REJECTED',
          'RETURNED',
          'CANCELLED',
        ] as LeaveRequestStatus[]
      ).map((value) => ({
        value,
        label: formatLeaveStatus(value, t),
      })),
    [t],
  );

  const columns: ColumnsType<LeaveRequestListItem> = useMemo(
    () =>
      withControlledSort<LeaveRequestListItem>(
        [
          {
            title: t('hr.table.requestNumber'),
            dataIndex: 'requestNumber',
            key: 'requestNumber',
            width: 140,
            sorter: true,
            render: (value: string) => (
              <span className="font-medium tabular-nums">{value}</span>
            ),
          },
          {
            title: t('hr.table.leaveType'),
            dataIndex: 'leaveType',
            key: 'leaveType',
            width: 130,
            sorter: true,
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
            sorter: true,
            render: (value: string) => formatProjectDate(value),
          },
          {
            title: t('hr.table.endDate'),
            dataIndex: 'endDate',
            key: 'endDate',
            width: 120,
            responsive: ['md'],
            sorter: true,
            render: (value: string) => formatProjectDate(value),
          },
          {
            title: t('hr.table.days'),
            dataIndex: 'days',
            key: 'days',
            width: 72,
            align: 'right',
            sorter: true,
          },
          {
            title: t('common.status'),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            sorter: true,
            render: (value: string) => (
              <StatusBadge
                label={formatLeaveStatus(value, t)}
                variant={leaveStatusVariant(value)}
              />
            ),
          },
        ],
        sortBy,
        sortOrder,
      ) ?? [],
    [sortBy, sortOrder, t],
  );

  function errorMessage(error: unknown): string {
    if (error instanceof ApiRequestError) {
      return error.message;
    }
    return t('hr.leave.profileLoadError');
  }

  function handleBack(): void {
    if (isSelf) {
      router.push('/profile');
      return;
    }
    if (targetEmployeeId) {
      router.push(`/users/${targetEmployeeId}`);
      return;
    }
    router.push('/hr/leave-requests');
  }

  if (!isSelf && !employeeId) {
    return (
      <Alert type="error" showIcon title={t('hr.leave.profileLoadError')} />
    );
  }

  if (!allowed) {
    return (
      <div className={HISTORY_ROOT}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (
    !isSelf &&
    employeeQuery.isLoading &&
    !employeeQuery.data &&
    canViewHr
  ) {
    return (
      <div className={HISTORY_ROOT}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const annual = displayBalances.find((b) => b.leaveType === 'ANNUAL')?.balance;
  const parental = displayBalances.find(
    (b) => b.leaveType === 'MATERNITY' || b.leaveType === 'PATERNITY',
  );

  return (
    <div className={HISTORY_ROOT}>
      <section
        className="erp-employees-hero"
        aria-labelledby="erp-leave-history-hero-title"
      >
        <div className="erp-employees-hero-top">
          <div className="min-w-0">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={handleBack}
              className="!mb-2 !px-2"
            >
              {t('hr.buttons.back')}
            </Button>
            <h2
              id="erp-leave-history-hero-title"
              className="erp-employees-hero-title break-words"
            >
              {displayName}
            </h2>
            <p className="m-0 mt-1 text-[13px] text-white/80">
              {t('hr.leave.historyTitle')}
            </p>
          </div>
        </div>
        {/* TODO: re-enable when leave balances are verified — also show for isSelf / non-HR */}
        {showBalances ? (
          <div className="erp-users-stat-bar erp-employees-hero-stats">
            {[
              { label: t('hr.table.year'), value: String(year) },
              {
                label: t('hr.leaveType.ANNUAL'),
                value:
                  annual != null
                    ? `${annual.remaining} / ${annual.entitled + annual.broughtForward}`
                    : '-',
              },
              ...(parental?.balance
                ? [
                    {
                      label: t(`hr.leaveType.${parental.leaveType}`),
                      value: `${parental.balance.remaining} / ${parental.balance.entitled + parental.balance.broughtForward}`,
                    },
                  ]
                : []),
            ].map((item) => (
              <div key={item.label} className="erp-users-stat">
                <div className="min-w-0 text-left">
                  <p className="erp-users-stat-label">{item.label}</p>
                  <p className="erp-users-stat-value">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* TODO: re-enable when leave balances are verified — also show for isSelf / non-HR */}
      {showBalances ? (
        <div className="erp-pro-card erp-employees-list-card">
          <div className="erp-pro-card-toolbar erp-users-toolbar">
            <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
              <span aria-hidden className="erp-employees-card-icon">
                <Wallet size={18} />
              </span>
              <h3 className="erp-pro-card-toolbar-title">
                {t('hr.section.leaveBalance')}
              </h3>
            </div>
            <div className="erp-users-toolbar-actions flex items-center gap-2">
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
          </div>
          <div className="p-4">
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
          </div>
        </div>
      ) : null}

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <CalendarDays size={18} />
            </span>
            <h3 className="erp-pro-card-toolbar-title">
              {t('hr.leave.historyTitle')}
            </h3>
          </div>
        </div>
        <div className="erp-users-filter-bar">
          <Select
            allowClear
            placeholder={t('hr.placeholder.leaveType')}
            className="w-full min-w-0 sm:w-44"
            options={leaveTypeOptions}
            value={leaveTypeFilter}
            onChange={(value) => {
              setLeaveTypeFilter(value);
              resetPage();
            }}
          />
          <Select
            allowClear
            placeholder={t('common.status')}
            className="w-full min-w-0 sm:w-40"
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              resetPage();
            }}
          />
        </div>

        {historyQuery.isError ? (
          <div className="p-4">
            <Alert
              type="error"
              showIcon
              title={errorMessage(historyQuery.error)}
            />
          </div>
        ) : (
          <div className="erp-pro-table-card-body">
            <DataTable<LeaveRequestListItem>
              rowKey="id"
              className="erp-pro-table erp-users-table"
              size="small"
              loading={historyQuery.isLoading}
              columns={columns}
              dataSource={historyRows}
              onChange={
                handleTableChange as TableProps<LeaveRequestListItem>['onChange']
              }
              onRow={(record) => ({
                onClick: () =>
                  router.push(
                    leaveRequestDetailHref(record.id, detailReturnTo),
                  ),
                style: { cursor: 'pointer' },
              })}
              pagination={{
                ...bindMeta(historyMeta),
                showSizeChanger: false,
              }}
              locale={{
                emptyText: (
                  <TableEmptyState
                    icon={<CalendarDays />}
                    title={t('hr.leave.noHistory')}
                  />
                ),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
