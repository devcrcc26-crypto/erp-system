'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  InputNumber,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
} from '@/lib/api/leave.types';
import { useLeaveBalances } from '@/lib/query/leave';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatLeaveEmployeeName,
  formatLeaveType,
} from '@/lib/utils/leave-display';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

const LOW_BALANCE_THRESHOLD = 5;

function renderBalanceCell(balance: LeaveBalance | null): React.ReactNode {
  if (!balance) {
    return <span style={{ color: tokens.colorTextSecondary }}>—</span>;
  }

  const isLow = balance.remaining <= LOW_BALANCE_THRESHOLD;

  return (
    <div className="leading-5">
      <div>
        <span
          className="text-sm font-medium"
          style={{
            color: isLow ? '#BA7517' : tokens.colorTextPrimary,
          }}
        >
          {balance.remaining}
        </span>
        <span
          className="ml-1 text-xs"
          style={{ color: tokens.colorTextTertiary }}
        >
          / {balance.entitled + balance.broughtForward}
        </span>
      </div>
      <span className="text-xs" style={{ color: tokens.colorTextSecondary }}>
        {balance.used} used · {balance.pending} pending
      </span>
    </div>
  );
}

/**
 * HR-only tab listing employee leave balances — layout aligned with Users page.
 */
export default function LeaveBalancesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const listParams = useMemo(
    () => ({
      ...params,
      year,
      search: appliedSearch.trim() || undefined,
      employeeId,
    }),
    [params, year, appliedSearch, employeeId],
  );

  const balancesQuery = useLeaveBalances(listParams, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: true },
  );

  const rows = balancesQuery.data?.data ?? [];
  const meta = balancesQuery.data?.meta;
  const totalCount = meta?.total ?? 0;

  const pageStats = useMemo(() => {
    let lowBalance = 0;
    let withPending = 0;
    let annualRemainingSum = 0;
    let annualCount = 0;

    for (const row of rows) {
      if (row.annual) {
        annualRemainingSum += row.annual.remaining;
        annualCount += 1;
        if (row.annual.remaining <= LOW_BALANCE_THRESHOLD) {
          lowBalance += 1;
        }
        if (row.annual.pending > 0) {
          withPending += 1;
        }
      }
    }

    return {
      lowBalance,
      withPending,
      avgRemaining:
        annualCount > 0 ? Math.round(annualRemainingSum / annualCount) : 0,
    };
  }, [rows]);

  const columns: ColumnsType<EmployeeLeaveBalanceSummary> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: 220,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) => (
          <div className="min-w-0 py-0.5">
            <p
              className="m-0 text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {formatLeaveEmployeeName(row.employee)}
            </p>
            {row.employee.email ? (
              <p
                className="m-0 truncate text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {row.employee.email}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: formatLeaveType('ANNUAL', t),
        key: 'annual',
        width: 150,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.annual),
      },
      {
        title: formatLeaveType('MATERNITY', t),
        key: 'maternity',
        width: 150,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.maternity),
      },
      {
        title: formatLeaveType('SICK', t),
        key: 'sick',
        width: 150,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.sick),
      },
    ],
    [t],
  );

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setEmployeeId(undefined);
    setYear(currentYear);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    Boolean(employeeId) ||
    year !== currentYear;

  if (balancesQuery.isLoading && !balancesQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {balancesQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            balancesQuery.error instanceof ApiRequestError
              ? balancesQuery.error.message
              : t('hr.messages.failedToLoadLeaveBalances')
          }
        />
      ) : null}

      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{
            color: tokens.colorTextPrimary,
            fontFamily: tokens.fontFamily,
          }}
        >
          {t('hr.tabs.leaveBalances')}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          Track entitled, used, and remaining leave by employee for {year}.
        </p>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Employees"
          value={totalCount}
          color="teal"
          icon={<UserOutlined />}
        />
        <StatCard
          label="Year"
          value={year}
          color="blue"
          icon={<CalendarOutlined />}
        />
        <StatCard
          label="Low balance"
          value={pageStats.lowBalance}
          sub={
            rows.length > 0
              ? `≤ ${LOW_BALANCE_THRESHOLD} days on this page`
              : undefined
          }
          color="amber"
          icon={<WarningOutlined />}
        />
        <StatCard
          label="With pending"
          value={pageStats.withPending}
          sub={
            rows.length > 0 ? 'Annual leave on this page' : undefined
          }
          color="default"
          icon={<ClockCircleOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input.Search
            placeholder={t('hr.placeholder.searchEmployee')}
            className="w-72"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(value) => {
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('hr.placeholder.employee')}
            className="w-48"
            options={(usersQuery.data?.data ?? []).map((user) => ({
              value: user.id,
              label: formatUserName(user),
            }))}
            value={employeeId}
            onChange={(value: string | undefined) => {
              setEmployeeId(value);
              resetPage();
            }}
          />
          <div className="flex items-center gap-2">
            <span
              className="text-sm whitespace-nowrap"
              style={{ color: tokens.colorTextSecondary }}
            >
              {t('hr.labels.year')}
            </span>
            <InputNumber
              min={2000}
              max={2100}
              value={year}
              onChange={(value) => {
                if (value != null) {
                  setYear(value);
                  resetPage();
                }
              }}
              className="w-28"
              style={{ borderRadius: 0 }}
            />
          </div>
          <Button
            onClick={handleResetFilters}
            disabled={!hasFilters}
            style={{ borderRadius: 0 }}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={balancesQuery.isFetching && !balancesQuery.isLoading}
              onClick={() => void balancesQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CalendarOutlined style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('hr.tabs.leaveBalances')}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {totalCount}{' '}
              {totalCount === 1 ? 'employee' : 'employees'} · {year}
            </span>
          </div>
        </div>

        <div className="px-0">
          <DataTable<EmployeeLeaveBalanceSummary>
            rowKey="employeeId"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            scroll={false}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CalendarOutlined />}
                  title={t('hr.empty.noLeaveBalances')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : undefined
                  }
                />
              ),
            }}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : false
            }
          />
        </div>
      </div>
    </div>
  );
}
