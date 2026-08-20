'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Input, InputNumber, Select, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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

function renderBalanceCell(balance: LeaveBalance | null): React.ReactNode {
  if (!balance) {
    return <span style={{ color: tokens.colorTextSecondary }}>—</span>;
  }

  return (
    <div className="leading-5">
      <div>
        <span className="font-medium">{balance.remaining}</span>
      </div>
      <span className="text-xs" style={{ color: tokens.colorTextSecondary }}>
        {balance.used} used · {balance.pending} pending
      </span>
    </div>
  );
}

/**
 * HR-only tab listing employee leave balances with rule guidance.
 */
export default function LeaveBalancesListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const { params, resetPage, bindMeta } = useTablePagination();
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
  const usersQuery = useUsersDirectory({ page: 1, limit: 100 }, { enabled: true });

  const rows = balancesQuery.data?.data ?? [];
  const meta = balancesQuery.data?.meta;

  const columns: ColumnsType<EmployeeLeaveBalanceSummary> = useMemo(
    () => [
      {
        title: t('hr.table.employee'),
        key: 'employee',
        fixed: 'left',
        width: 200,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          formatLeaveEmployeeName(row.employee),
      },
      {
        title: formatLeaveType('ANNUAL', t),
        key: 'annual',
        width: 140,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.annual),
      },
      {
        title: formatLeaveType('MATERNITY', t),
        key: 'maternity',
        width: 140,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.maternity),
      },
      {
        title: formatLeaveType('SICK', t),
        key: 'sick',
        width: 140,
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

  function handleQuery(): void {
    setAppliedSearch(search.trim());
    resetPage();
  }

  if (balancesQuery.isLoading && !balancesQuery.data) {
    return (
      <div className="erp-pro-card">
        <div className="flex justify-center p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="erp-pro-card">
        <div className="erp-pro-card-body">
          <div className="erp-pro-filter-form">
            <div className="erp-pro-filter-form-fields">
              <div
                className="erp-pro-filter-field"
                style={{ minWidth: 200, flex: '1 1 200px' }}
              >
                <span className="erp-pro-filter-field-label">
                  {t('common.search')}
                </span>
                <Input
                  placeholder={t('hr.placeholder.searchEmployee')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onPressEnter={handleQuery}
                  allowClear
                  onClear={() => {
                    setSearch('');
                    setAppliedSearch('');
                    resetPage();
                  }}
                />
              </div>
              <div className="erp-pro-filter-field">
                <span className="erp-pro-filter-field-label">
                  {t('hr.table.employee')}
                </span>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('hr.placeholder.employee')}
                  style={{ width: '100%', minWidth: 180 }}
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
              </div>
              <div className="erp-pro-filter-field" style={{ minWidth: 120 }}>
                <span className="erp-pro-filter-field-label">
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
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="erp-pro-filter-form-actions">
              <Button onClick={handleResetFilters} style={{ borderRadius: 2 }}>
                {t('common.reset')}
              </Button>
              <Button
                type="primary"
                onClick={handleQuery}
                style={{ borderRadius: 2 }}
              >
                {t('common.query')}
              </Button>
            </div>
          </div>
        </div>
      </div>

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

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <h1
            className="erp-pro-card-toolbar-title"
            style={{ fontSize: 16, fontWeight: 600 }}
          >
            {t('hr.tabs.leaveBalances')}
          </h1>
        </div>
        <div className="erp-pro-table-card-body">
          <DataTable<EmployeeLeaveBalanceSummary>
            rowKey="employeeId"
            className="erp-pro-table"
            size="middle"
            columns={columns}
            dataSource={rows}
            scroll={{ x: 900 }}
            locale={{
              emptyText: (
                <TableEmptyState title={t('hr.empty.noLeaveBalances')} />
              ),
            }}
            pagination={bindMeta(meta)}
          />
        </div>
      </div>
    </>
  );
}
