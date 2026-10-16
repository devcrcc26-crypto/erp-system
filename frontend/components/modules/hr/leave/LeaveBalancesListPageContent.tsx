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
  EditOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import LeaveBalanceEditModal from '@/components/modules/hr/leave/LeaveBalanceEditModal';
import ExportExcelButton from '@/components/modules/hr/import-export/ExportExcelButton';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanEditLeaveBalances } from '@/hooks/use-auth-capabilities';
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
import { buildLeaveBalanceExportSheets } from '@/lib/utils/leave-export';
import { filterLeaveBalances } from '@/lib/utils/leave-list-filter';
import { leaveHistoryPath } from '@/lib/utils/leave-history-path';

const LOW_BALANCE_THRESHOLD = 5;

function renderBalanceCell(
  balance: LeaveBalance | null,
  lowLabel: string,
): React.ReactNode {
  if (!balance) {
    return <span className="erp-users-cell-sub">-</span>;
  }

  const isLow = balance.remaining <= LOW_BALANCE_THRESHOLD;

  return (
    <div className="erp-leave-balance-cell">
      <div>
        <span
          className={`erp-leave-balance-remaining${
            isLow ? ' erp-leave-balance-remaining--low' : ''
          }`}
        >
          {balance.remaining}
        </span>
        <span className="erp-leave-balance-entitled">
          / {balance.entitled + balance.broughtForward}
        </span>
      </div>
      <span className="erp-leave-balance-meta">
        {balance.used} used · {balance.pending} pending
      </span>
      {isLow ? (
        <span className="erp-leave-balance-low-pill">{lowLabel}</span>
      ) : null}
    </div>
  );
}

/**
 * HR leave balances tab - Employees v2 chrome (floating stats, soft card).
 */
export default function LeaveBalancesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canEditBalances = useCanEditLeaveBalances();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [editTarget, setEditTarget] =
    useState<EmployeeLeaveBalanceSummary | null>(null);

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

  const lowLabel = t('pages.hr.leave.balanceStats.lowBalance');

  const columns: ColumnsType<EmployeeLeaveBalanceSummary> = useMemo(() => {
    const cols: ColumnsType<EmployeeLeaveBalanceSummary> = [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: isCompact ? 200 : 260,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) => (
          <div className="erp-leave-person">
            <EvaluationListAvatar
              firstName={row.employee.firstName}
              lastName={row.employee.lastName}
              userId={row.employee.id}
            />
            <div className="min-w-0 flex-1">
              <p className="erp-users-name m-0 truncate">
                {formatLeaveEmployeeName(row.employee)}
              </p>
              {row.employee.email ? (
                <p className="erp-users-email m-0 mt-0.5 truncate">
                  {row.employee.email}
                </p>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        title: formatLeaveType('ANNUAL', t),
        key: 'annual',
        width: 160,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.annual, lowLabel),
      },
      {
        title: formatLeaveType('MATERNITY', t),
        key: 'maternity',
        width: 160,
        responsive: ['md'],
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          row.employee.gender === 'MALE'
            ? (
                <span className="erp-users-cell-sub">-</span>
              )
            : renderBalanceCell(row.maternity, lowLabel),
      },
      {
        title: formatLeaveType('SICK', t),
        key: 'sick',
        width: 160,
        responsive: ['md'],
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.sick, lowLabel),
      },
    ];

    if (canEditBalances) {
      cols.push({
        title: t('common.actions'),
        key: 'actions',
        width: 110,
        fixed: isCompact ? undefined : 'right',
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) => (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            className="!px-0"
            onClick={(event) => {
              event.stopPropagation();
              setEditTarget(row);
            }}
          >
            {t('hr.leave.ledger.editBalances')}
          </Button>
        ),
      });
    }

    return cols;
  }, [canEditBalances, isCompact, lowLabel, t]);

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setYear(currentYear);
    resetPage();
  }

  const hasFilters = Boolean(appliedSearch.trim()) || year !== currentYear;

  if (balancesQuery.isLoading && !balancesQuery.data) {
    return (
      <div className="erp-leave-loading">
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
        <EvaluationStat
          label={t('pages.hr.leave.balanceStats.employees')}
          value={meta.total}
          accent="teal"
          icon={<UserOutlined />}
        />
        <EvaluationStat
          label={t('hr.labels.year')}
          value={year}
          accent="blue"
          icon={<CalendarOutlined />}
        />
        <EvaluationStat
          label={t('pages.hr.leave.balanceStats.lowBalance')}
          value={pageStats.lowBalance}
          accent="amber"
          icon={<WarningOutlined />}
        />
        <EvaluationStat
          label={t('pages.hr.leave.balanceStats.withPending')}
          value={pageStats.withPending}
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
            scroll={{ x: isCompact ? 480 : 760 }}
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

      <LeaveBalanceEditModal
        open={editTarget != null}
        employeeSummary={editTarget}
        defaultYear={editTarget?.year ?? year}
        onClose={() => setEditTarget(null)}
      />
    </>
  );
}
