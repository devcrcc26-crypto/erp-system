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
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
import LeaveBalanceEditModal from '@/components/modules/hr/leave/LeaveBalanceEditModal';
import ExportExcelButton from '@/components/modules/hr/import-export/ExportExcelButton';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanEditLeaveBalances } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveType,
} from '@/lib/api/leave.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useLeaveBalancesAll } from '@/lib/query/leave';
import {
  formatLeaveEmployeeName,
  formatLeaveType,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { buildLeaveBalanceExportSheets } from '@/lib/utils/leave-export';
import { filterLeaveBalances } from '@/lib/utils/leave-list-filter';
import { leaveHistoryPath } from '@/lib/utils/leave-history-path';

const LOW_BALANCE_THRESHOLD = 5;

interface LeaveBalanceFlatRow {
  key: string;
  employeeId: string;
  employee: EmployeeLeaveBalanceSummary['employee'];
  year: number;
  leaveType: LeaveType;
  balance: LeaveBalance;
  summary: EmployeeLeaveBalanceSummary;
}

function flattenBalanceSummaries(
  summaries: EmployeeLeaveBalanceSummary[],
): LeaveBalanceFlatRow[] {
  const rows: LeaveBalanceFlatRow[] = [];
  for (const summary of summaries) {
    const entries: Array<{ leaveType: LeaveType; balance: LeaveBalance | null }> =
      [
        { leaveType: 'ANNUAL', balance: summary.annual },
        { leaveType: 'MATERNITY', balance: summary.maternity },
        { leaveType: 'PATERNITY', balance: summary.paternity },
        { leaveType: 'SICK', balance: summary.sick },
      ];
    for (const entry of entries) {
      if (!entry.balance) {
        continue;
      }
      rows.push({
        key: `${summary.employeeId}-${entry.leaveType}`,
        employeeId: summary.employeeId,
        employee: summary.employee,
        year: summary.year,
        leaveType: entry.leaveType,
        balance: entry.balance,
        summary,
      });
    }
  }
  return rows;
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

  const flatRows = useMemo(
    () => flattenBalanceSummaries(filtered),
    [filtered],
  );

  const meta: PaginationMeta = useMemo(() => {
    const total = flatRows.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [flatRows.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return flatRows.slice(start, start + meta.limit);
  }, [flatRows, meta.page, meta.limit]);

  const pageStats = useMemo(() => {
    let lowBalance = 0;
    let withPending = 0;
    const employeeIds = new Set<string>();

    for (const row of flatRows) {
      employeeIds.add(row.employeeId);
      if (row.balance.remaining <= LOW_BALANCE_THRESHOLD) {
        lowBalance += 1;
      }
      if (row.balance.pending > 0) {
        withPending += 1;
      }
    }

    return {
      employees: employeeIds.size,
      lowBalance,
      withPending,
    };
  }, [flatRows]);

  const columns: ColumnsType<LeaveBalanceFlatRow> = useMemo(() => {
    const cols: ColumnsType<LeaveBalanceFlatRow> = [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        width: isCompact ? 180 : 240,
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
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
        title: t('hr.table.leaveType'),
        key: 'leaveType',
        width: 130,
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
          <StatusBadge
            label={formatLeaveType(row.leaveType, t)}
            variant={leaveTypeVariant(row.leaveType)}
          />
        ),
      },
      {
        title: t('hr.labels.entitlement'),
        key: 'entitled',
        width: 110,
        align: 'right',
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
          <span className="tabular-nums">{row.balance.entitled}</span>
        ),
      },
      {
        title: t('hr.labels.broughtForward'),
        key: 'broughtForward',
        width: 130,
        align: 'right',
        responsive: ['md'],
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
          <span className="tabular-nums">{row.balance.broughtForward}</span>
        ),
      },
      {
        title: t('hr.labels.used'),
        key: 'used',
        width: 90,
        align: 'right',
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
          <span className="tabular-nums">{row.balance.used}</span>
        ),
      },
      {
        title: t('hr.labels.pending'),
        key: 'pending',
        width: 100,
        align: 'right',
        responsive: ['md'],
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
          <span className="tabular-nums">{row.balance.pending}</span>
        ),
      },
      {
        title: t('hr.labels.available'),
        key: 'available',
        width: 110,
        align: 'right',
        render: (_: unknown, row: LeaveBalanceFlatRow) => {
          const isLow = row.balance.remaining <= LOW_BALANCE_THRESHOLD;
          return (
            <div className="erp-leave-balance-cell">
              <span
                className={`erp-leave-balance-remaining${
                  isLow ? ' erp-leave-balance-remaining--low' : ''
                }`}
              >
                {row.balance.remaining}
              </span>
              {isLow ? (
                <span className="erp-leave-balance-low-pill">
                  {t('pages.hr.leave.balanceStats.lowBalance')}
                </span>
              ) : null}
            </div>
          );
        },
      },
    ];

    if (canEditBalances) {
      cols.push({
        title: t('common.actions'),
        key: 'actions',
        width: 110,
        fixed: isCompact ? undefined : 'right',
        render: (_: unknown, row: LeaveBalanceFlatRow) => (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            className="!px-0"
            onClick={(event) => {
              event.stopPropagation();
              setEditTarget(row.summary);
            }}
          >
            {t('hr.leave.ledger.editBalances')}
          </Button>
        ),
      });
    }

    return cols;
  }, [canEditBalances, isCompact, t]);

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
          <DataTable<LeaveBalanceFlatRow>
            rowKey="key"
            className="erp-pro-table erp-users-table erp-leave-v2"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            scroll={{ x: isCompact ? 560 : 900 }}
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
