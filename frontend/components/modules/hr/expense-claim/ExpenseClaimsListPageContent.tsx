'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { DollarOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ExpenseClaimListItem,
  ExpenseClaimStatus,
} from '@/lib/api/expense-claim.types';
import { useExpenseClaims } from '@/lib/query/expense-claim';
import { useUsersDirectory } from '@/lib/query/users';
import {
  EXPENSE_CLAIM_STATUS_OPTIONS,
  expenseClaimStatusVariant,
  formatEtbAmount,
  formatExpenseClaimEmployeeName,
  formatExpenseClaimStatus,
} from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Company or personal expense claim list with filters.
 */
export default function ExpenseClaimsListPageContent(): React.ReactNode {
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpenseClaimStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      employeeId: canViewHr ? employeeId : undefined,
    }),
    [params, search, statusFilter, employeeId, canViewHr],
  );

  const listQuery = useExpenseClaims(listParams, true);

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<ExpenseClaimListItem> = [
    {
      title: 'Claim #',
      dataIndex: 'claimNumber',
      key: 'claimNumber',
      width: 120,
    },
    ...(canViewHr
      ? [
          {
            title: 'Employee',
            key: 'employee',
            render: (_: unknown, row: ExpenseClaimListItem) =>
              formatExpenseClaimEmployeeName(row.employee),
          } satisfies ColumnsType<ExpenseClaimListItem>[number],
        ]
      : []),
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Items',
      dataIndex: 'itemCount',
      key: 'itemCount',
      width: 80,
      align: 'right',
    },
    {
      title: 'Total',
      dataIndex: 'totalAmountEtb',
      key: 'totalAmountEtb',
      width: 140,
      align: 'right',
      render: (value: number) => formatEtbAmount(value),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: ExpenseClaimStatus) => (
        <StatusBadge
          label={formatExpenseClaimStatus(value)}
          variant={expenseClaimStatusVariant(value)}
        />
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (value: string) => formatProjectDate(value),
    },
  ];

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {canViewHr ? 'Expense Claims' : 'My Expense Claims'}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {canViewHr
              ? 'Review and process employee reimbursement claims.'
              : 'Submit and track your expense claims through the approval workflow.'}
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push('/approvals/new/expense-claim')}
        >
          New Claim
        </Button>
      </div>

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load expense claims'
          }
        />
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder="Search claim # or title"
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Status"
          style={{ minWidth: 180 }}
          options={EXPENSE_CLAIM_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value: ExpenseClaimStatus[]) => {
            setStatusFilter(value);
            resetPage();
          }}
        />
        {canViewHr ? (
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Employee"
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
        ) : null}
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<ExpenseClaimListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          onRow={(record) => ({
            onClick: () => router.push(`/hr/expense-claims/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<DollarOutlined />}
                title="No expense claims"
                description="Create a claim to start the reimbursement workflow."
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
