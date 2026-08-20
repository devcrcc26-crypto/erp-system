'use client';

import { useMemo, useState } from 'react';
import { Alert, InputNumber, Select, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
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
  DEDUCTS_FROM_ANNUAL,
  OWN_BALANCE_LEAVE_TYPES,
  formatLeaveEmployeeName,
  formatLeaveType,
} from '@/lib/utils/leave-display';
import { formatUserName } from '@/lib/utils/user-display';

function renderBalanceCell(balance: LeaveBalance | null): React.ReactNode {
  if (!balance) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  return (
    <div className="leading-5">
      <div>
        <Typography.Text strong>{balance.remaining}</Typography.Text>
      </div>
      <Typography.Text type="secondary" className="text-xs">
        {balance.used} used · {balance.pending} pending
      </Typography.Text>
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
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const listParams = useMemo(
    () => ({
      ...params,
      year,
      search: search.trim() || undefined,
      employeeId,
    }),
    [params, year, search, employeeId],
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
        title: t('hr.labels.annualLeave'),
        key: 'annual',
        width: 220,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          row.annual ? (
            <div className="leading-5">
              <div>
                <Typography.Text strong>{row.annual.remaining}</Typography.Text>
                <Typography.Text type="secondary" className="ml-1 text-xs">
                  {t('hr.labels.remaining').toLowerCase()}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary" className="text-xs block">
                {t('hr.labels.entitled')}: {row.annual.entitled} ·{' '}
                {t('hr.labels.broughtForward')}: {row.annual.broughtForward}
              </Typography.Text>
              <Typography.Text type="secondary" className="text-xs block">
                {t('hr.labels.used')}: {row.annual.used} · {t('hr.labels.pending')}:{' '}
                {row.annual.pending}
              </Typography.Text>
            </div>
          ) : (
            renderBalanceCell(null)
          ),
      },
      {
        title: t('hr.leaveType.MATERNITY'),
        key: 'maternity',
        width: 140,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.maternity),
      },
      {
        title: t('hr.leaveType.COMPASSIONATE'),
        key: 'compassionate',
        width: 140,
        render: (_: unknown, row: EmployeeLeaveBalanceSummary) =>
          renderBalanceCell(row.compassionate),
      },
    ],
    [t],
  );

  if (balancesQuery.isLoading && !balancesQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Alert
          type="info"
          showIcon
          title={t('hr.leaveBalanceRules.ownBalancesTitle')}
          description={
            <ul className="m-0 pl-4">
              {OWN_BALANCE_LEAVE_TYPES.map((leaveType) => (
                <li key={leaveType}>
                  <strong>{formatLeaveType(leaveType, t)}</strong>
                  {leaveType === 'ANNUAL'
                    ? ` — ${t('hr.leaveBalanceRules.annualIncludesBroughtForward')}`
                    : ` — ${t('hr.leaveBalanceRules.separateBalance')}`}
                </li>
              ))}
            </ul>
          }
        />
        <Alert
          type="warning"
          showIcon
          title={t('hr.leaveBalanceRules.deductsFromAnnualTitle')}
          description={
            <ul className="m-0 pl-4">
              {DEDUCTS_FROM_ANNUAL.map((leaveType) => (
                <li key={leaveType}>{formatLeaveType(leaveType, t)}</li>
              ))}
            </ul>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.placeholder.searchEmployee')}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t('hr.placeholder.employee')}
          style={{ minWidth: 200 }}
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
        <div className="flex items-center gap-2" style={{ width: 160 }}>
          <span className="text-xs font-medium text-[rgba(0,0,0,0.65)]">
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
        <TableUpdatingIndicator active={balancesQuery.isFetching} />
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

      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<EmployeeLeaveBalanceSummary>
          rowKey="employeeId"
          columns={columns}
          dataSource={rows}
          loading={balancesQuery.isFetching}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <TableEmptyState
                title={t('hr.empty.noLeaveBalances')}
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
