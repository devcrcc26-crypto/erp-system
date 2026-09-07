'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Grid,
  Input,
  InputNumber,
  Spin,
  Tooltip,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
} from '@/lib/api/leave.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useLeaveBalancesAll } from '@/lib/query/leave';
import {
  formatLeaveEmployeeName,
  formatLeaveType,
} from '@/lib/utils/leave-display';
import ExportExcelButton from '@/components/modules/hr/import-export/ExportExcelButton';
import { buildLeaveBalanceExportSheets } from '@/lib/utils/leave-export';
import { filterLeaveBalances } from '@/lib/utils/leave-list-filter';
import { leaveHistoryPath } from '@/lib/utils/leave-history-path';

const LOW_BALANCE_THRESHOLD = 5;

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  slate: { bg: '#EEF1F4', fg: '#64748B' },
} as const;

function BalanceStat({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: number;
  sub?: string;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <div className="erp-users-stat">
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
        {sub ? <p className="erp-users-email m-0 mt-0.5">{sub}</p> : null}
      </div>
    </div>
  );
}

function renderBalanceCell(balance: LeaveBalance | null): React.ReactNode {
  if (!balance) {
    return <span className="erp-users-cell-sub">-</span>;
  }

  const isLow = balance.remaining <= LOW_BALANCE_THRESHOLD;

  return (
    <div className="leading-5">
      <div>
        <span
          className="erp-users-cell-strong"
          style={isLow ? { color: '#BA7517' } : undefined}
        >
          {balance.remaining}
        </span>
        <span className="erp-users-cell-sub ml-1">
          / {balance.entitled + balance.broughtForward}
        </span>
      </div>
      <span className="erp-users-email">
        {balance.used} used · {balance.pending} pending
      </span>
    </div>
  );
}

/**
 * HR leave balances tab - Users chrome.
 */
export default function LeaveBalancesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const balancesQuery = useLeaveBalancesAll({ year }, true);
  const allRows = balancesQuery.data ?? [];

  const filtered = useMemo(
    () =>
      filterLeaveBalances(allRows, {
        search: appliedSearch,
      }),
    [allRows, appliedSearch],
  );


  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [filtered.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const pageStats = useMemo(() => {
    let lowBalance = 0;
    let withPending = 0;

    for (const row of filtered) {
      if (row.annual) {
        if (row.annual.remaining <= LOW_BALANCE_THRESHOLD) {
          lowBalance += 1;
        }
        if (row.annual.pending > 0) {
          withPending += 1;
        }
      }
    }

    return { lowBalance, withPending };
  }, [filtered]);

  const columns: ColumnsType<EmployeeLeaveBalanceSummary> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: 220,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0">
              {formatLeaveEmployeeName(row.employee)}
            </p>
            {row.employee.email ? (
              <p className="erp-users-email m-0 mt-0.5">
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
        responsive: ['md'],
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.maternity),
      },
      {
        title: formatLeaveType('SICK', t),
        key: 'sick',
        width: 150,
        responsive: ['md'],
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.sick),
      },
    ],
    [t],
  );

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setYear(currentYear);
    resetPage();
  }

  const hasFilters = Boolean(appliedSearch.trim()) || year !== currentYear;

  if (balancesQuery.isLoading && !balancesQuery.data) {
    return (
      <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <>
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

      <div className="erp-users-stat-bar">
        <BalanceStat
          label={t('pages.hr.leave.balanceStats.employees')}
          value={meta.total}
          accent="teal"
          icon={<UserOutlined />}
        />
        <BalanceStat
          label={t('hr.labels.year')}
          value={year}
          accent="blue"
          icon={<CalendarOutlined />}
        />
        <BalanceStat
          label={t('pages.hr.leave.balanceStats.lowBalance')}
          value={pageStats.lowBalance}
          sub={t('pages.hr.leave.balanceStats.lowBalanceSub', {
            threshold: LOW_BALANCE_THRESHOLD,
          })}
          accent="amber"
          icon={<WarningOutlined />}
        />
        <BalanceStat
          label={t('pages.hr.leave.balanceStats.withPending')}
          value={pageStats.withPending}
          sub={t('pages.hr.leave.balanceStats.withPendingSub')}
          accent="slate"
          icon={<ClockCircleOutlined />}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('hr.tabs.leaveBalances')}
            </h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={balancesQuery.isFetching && !balancesQuery.isLoading}
                onClick={() => void balancesQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <ExportExcelButton
              compact={isCompact}
              actions={[
                {
                  key: 'balances',
                  filePrefix: 'leave-balances',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildLeaveBalanceExportSheets(filtered),
                },
              ]}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('hr.placeholder.searchEmployee')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onPressEnter={() => {
              setAppliedSearch(search.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <div className="flex items-center gap-2">
            <span className="erp-users-cell-sub whitespace-nowrap">
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
            />
          </div>
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<EmployeeLeaveBalanceSummary>
            rowKey="employeeId"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            scroll={{ x: isCompact ? 480 : 720 }}
            onRow={(record) => ({
              onClick: () => router.push(leaveHistoryPath(record.employeeId)),
              className: 'cursor-pointer',
            })}
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
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
              simple: screens.sm === false,
              showSizeChanger: screens.sm !== false,
            }}
          />
        </div>
      </div>
    </>
  );
}
