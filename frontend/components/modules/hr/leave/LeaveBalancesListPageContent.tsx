'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Grid,
  Input,
  InputNumber,
  Spin,
  Tooltip,
  type TableProps,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  WalletOutlined,
  WarningFilled,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import LeaveBalanceEditModal from '@/components/modules/hr/leave/LeaveBalanceEditModal';
import ExportExcelButton from '@/components/modules/hr/import-export/ExportExcelButton';
import DataTable from '@/components/ui/DataTable/DataTable';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanEditLeaveBalances } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useTablePagination,
  withControlledSort,
} from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
} from '@/lib/api/leave.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useLeaveBalancesAll } from '@/lib/query/leave';
import {
  employeeBalanceEntries,
  isLowLeaveBalance,
  LOW_LEAVE_BALANCE_THRESHOLD,
  parentalBalanceFor,
  summarizeLeaveBalanceStats,
} from '@/lib/utils/leave-balance-summary';
import {
  formatLeaveEmployeeName,
  formatLeaveType,
} from '@/lib/utils/leave-display';
import { buildLeaveBalanceExportSheets } from '@/lib/utils/leave-export';
import { filterLeaveBalances } from '@/lib/utils/leave-list-filter';
import { leaveHistoryPath } from '@/lib/utils/leave-history-path';
import { sortLeaveBalances } from '@/lib/utils/table-sort';

type Translate = ReturnType<typeof useEpcTranslation>['t'];

const TABLE_KEY = 'pages.hr.leave.balanceTable';

/** `available / entitlement`, amber with a warning icon when low. */
function BalanceCell({
  balance,
  caption,
  t,
}: {
  balance: LeaveBalance | null;
  /** Small label under the figure (the parental column names the type). */
  caption?: string;
  t: Translate;
}): React.ReactNode {
  if (!balance) {
    return (
      <span
        className="erp-users-cell-sub"
        aria-label={t(`${TABLE_KEY}.notApplicable`)}
      >
        —
      </span>
    );
  }
  const isLow = isLowLeaveBalance(balance);
  const summary = t(`${TABLE_KEY}.availableOfEntitled`, {
    available: balance.remaining,
    entitled: balance.entitled,
  });
  return (
    <div className="erp-leave-bal-cell">
      <span className="erp-leave-bal-figure" title={summary}>
        <span
          className={`erp-leave-balance-remaining${
            isLow ? ' erp-leave-balance-remaining--low' : ''
          }`}
        >
          {balance.remaining}
        </span>
        <span className="erp-leave-bal-of"> / {balance.entitled}</span>
        {isLow ? (
          <Tooltip
            title={t(`${TABLE_KEY}.lowBalanceHint`, {
              count: LOW_LEAVE_BALANCE_THRESHOLD,
            })}
          >
            <WarningFilled
              className="erp-leave-bal-low-icon"
              aria-label={t('pages.hr.leave.balanceStats.lowBalance')}
              role="img"
            />
          </Tooltip>
        ) : null}
      </span>
      {caption ? <span className="erp-leave-bal-caption">{caption}</span> : null}
    </div>
  );
}

/** Expanded row: full breakdown per leave type that applies to the employee. */
function BalanceDetails({
  summary,
  t,
}: {
  summary: EmployeeLeaveBalanceSummary;
  t: Translate;
}): React.ReactNode {
  const entries = employeeBalanceEntries(summary);
  const name = formatLeaveEmployeeName(summary.employee);
  return (
    <div
      className="erp-leave-bal-details"
      role="region"
      aria-label={t(`${TABLE_KEY}.details`, { name })}
    >
      <div className="erp-leave-bal-detail-grid">
        {entries.map(({ leaveType, balance }) => {
          const isLow = isLowLeaveBalance(balance);
          const rows: Array<{ label: string; value: number; strong?: boolean }> = [
            { label: t('hr.labels.entitlement'), value: balance.entitled },
            { label: t('hr.labels.broughtForward'), value: balance.broughtForward },
            { label: t('hr.labels.used'), value: balance.used },
            { label: t('hr.labels.pending'), value: balance.pending },
            { label: t('hr.labels.available'), value: balance.remaining, strong: true },
          ];
          return (
            <section
              key={leaveType}
              className={`erp-leave-bal-detail-card${
                isLow ? ' erp-leave-bal-detail-card--low' : ''
              }`}
            >
              <h4 className="erp-leave-bal-detail-title">
                {formatLeaveType(leaveType, t)}
                {isLow ? (
                  <span className="erp-leave-balance-low-pill">
                    {t('pages.hr.leave.balanceStats.lowBalance')}
                  </span>
                ) : null}
              </h4>
              <dl className="erp-leave-bal-detail-list">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className={
                      row.strong ? 'erp-leave-bal-detail-row--total' : undefined
                    }
                  >
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
      <Link
        href={leaveHistoryPath(summary.employeeId)}
        className="erp-leave-bal-history-link"
      >
        <HistoryOutlined aria-hidden />
        {t(`${TABLE_KEY}.viewHistory`)}
      </Link>
    </div>
  );
}

/**
 * HR leave balances tab: one row per employee with Annual, Sick and the
 * gender-applicable parental balance side by side; expand a row for the
 * full breakdown.
 */
export default function LeaveBalancesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canEditBalances = useCanEditLeaveBalances();
  const { params, resetPage, bindMeta, handleTableChange, sortBy, sortOrder } =
    useTablePagination({
      initialPageSize: 10,
      initialSortBy: 'employee',
      initialSortOrder: 'asc',
    });
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [editTarget, setEditTarget] =
    useState<EmployeeLeaveBalanceSummary | null>(null);

  const balancesQuery = useLeaveBalancesAll({ year }, true);
  const allRows = useMemo(() => balancesQuery.data ?? [], [balancesQuery.data]);

  const filtered = useMemo(
    () =>
      filterLeaveBalances(allRows, {
        search: appliedSearch,
      }),
    [allRows, appliedSearch],
  );

  const sorted = useMemo(
    () => sortLeaveBalances(filtered, sortBy, sortOrder),
    [filtered, sortBy, sortOrder],
  );

  const meta: PaginationMeta = useMemo(() => {
    const total = sorted.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [sorted.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return sorted.slice(start, start + meta.limit);
  }, [sorted, meta.page, meta.limit]);

  const pageStats = useMemo(() => summarizeLeaveBalanceStats(filtered), [filtered]);

  const columns: ColumnsType<EmployeeLeaveBalanceSummary> = useMemo(() => {
    const cols: ColumnsType<EmployeeLeaveBalanceSummary> = [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: isCompact ? 190 : 260,
        sorter: true,
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
        title: t('users.form.employeeId'),
        key: 'employeeCode',
        width: 130,
        responsive: ['md'],
        sorter: true,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          row.employee.employeeCode ? (
            <span className="erp-users-id-chip">{row.employee.employeeCode}</span>
          ) : (
            <span className="erp-users-cell-sub">—</span>
          ),
      },
      {
        title: formatLeaveType('ANNUAL', t),
        key: 'annual',
        width: 120,
        sorter: true,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) => (
          <BalanceCell balance={row.annual} t={t} />
        ),
      },
      {
        title: t(`${TABLE_KEY}.parental`),
        key: 'parental',
        width: 150,
        sorter: true,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) => {
          const parental = parentalBalanceFor(row);
          return (
            <BalanceCell
              balance={parental?.balance ?? null}
              caption={
                parental ? formatLeaveType(parental.leaveType, t) : undefined
              }
              t={t}
            />
          );
        },
      },
    ];

    if (canEditBalances) {
      cols.push({
        title: t('common.actions'),
        key: 'actions',
        width: 130,
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

    return (
      withControlledSort<EmployeeLeaveBalanceSummary>(cols, sortBy, sortOrder) ??
      cols
    );
  }, [canEditBalances, isCompact, sortBy, sortOrder, t]);

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

      <section
        className="erp-employees-hero"
        aria-labelledby="erp-leave-balances-hero-title"
      >
        <div className="erp-employees-hero-top">
          <h2
            id="erp-leave-balances-hero-title"
            className="erp-employees-hero-title"
          >
            {t('pages.hr.listHeroTitle', {
              title: t('hr.tabs.leaveBalances'),
              count: pageStats.employees.toLocaleString(),
            })}
          </h2>
          <div className="erp-employees-hero-actions">
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
        <div className="erp-users-stat-bar erp-employees-hero-stats">
          <EvaluationStat
            label={t('pages.hr.leave.balanceStats.employees')}
            value={pageStats.employees}
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
      </section>

      <div className="erp-pro-card erp-employees-list-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-3">
            <span aria-hidden className="erp-employees-card-icon">
              <WalletOutlined />
            </span>
            <h3 className="erp-pro-card-toolbar-title">
              {t('hr.tabs.leaveBalances')}
            </h3>
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
            className="erp-pro-table erp-users-table erp-leave-v2 erp-leave-bal-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            scroll={{ x: isCompact ? 640 : 900 }}
            onChange={
              handleTableChange as TableProps<EmployeeLeaveBalanceSummary>['onChange']
            }
            expandable={{
              expandRowByClick: true,
              expandedRowRender: (record) => (
                <BalanceDetails summary={record} t={t} />
              ),
            }}
            rowClassName={() => 'cursor-pointer'}
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
