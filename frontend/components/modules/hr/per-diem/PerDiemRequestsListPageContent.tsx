'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { PlusOutlined, WalletOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanManagePerDiemRates, useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PerDiemRequestListItem,
  PerDiemStatus,
} from '@/lib/api/per-diem.types';
import { usePerDiemRequests } from '@/lib/query/per-diem';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatPerDiemEmployeeName,
  formatPerDiemStatus,
  perDiemStatusVariant,
} from '@/lib/utils/per-diem-display';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Company or personal per diem request list with filters.
 */
export default function PerDiemRequestsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();

  const statusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: t('hr.status.DRAFT') },
      { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
      { value: 'IN_REVIEW', label: t('hr.status.IN_REVIEW') },
      { value: 'APPROVED', label: t('hr.status.APPROVED') },
      { value: 'REJECTED', label: t('hr.status.REJECTED') },
      { value: 'RETURNED', label: t('hr.status.RETURNED') },
      { value: 'CANCELLED', label: t('hr.status.CANCELLED') },
    ],
    [t],
  );
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const canManageRates = useCanManagePerDiemRates();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PerDiemStatus[]>([]);
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

  const listQuery = usePerDiemRequests(listParams, true);

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<PerDiemRequestListItem> = [
    {
      title: 'Request #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 120,
    },
    ...(canViewHr
      ? [
          {
            title: 'Employee',
            key: 'employee',
            render: (_: unknown, row: PerDiemRequestListItem) =>
              formatPerDiemEmployeeName(row.employee),
          } satisfies ColumnsType<PerDiemRequestListItem>[number],
        ]
      : []),
    { title: 'Destination', dataIndex: 'destination', key: 'destination' },
    {
      title: 'Dates',
      key: 'dates',
      width: 200,
      render: (_: unknown, row: PerDiemRequestListItem) =>
        `${formatProjectDate(row.startDate)} – ${formatProjectDate(row.endDate)}`,
    },
    { title: 'Days', dataIndex: 'days', key: 'days', width: 70, align: 'right' },
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
      render: (value: PerDiemStatus) => (
        <StatusBadge
          label={formatPerDiemStatus(value, t)}
          variant={perDiemStatusVariant(value)}
        />
      ),
    },
  ];

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div>
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load per diem requests'
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
          placeholder="Search request # or destination"
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Status"
          style={{ minWidth: 180 }}
          options={statusOptions}
          value={statusFilter}
          onChange={(value: PerDiemStatus[]) => {
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
        <div className="flex items-center gap-2 ml-auto">
          {canManageRates ? (
            <Button onClick={() => router.push('/hr/per-diem-rates')}>
              Manage Rates
            </Button>
          ) : null}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/per-diem')}
          >
            New Request
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<PerDiemRequestListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          onRow={(record) => ({
            onClick: () => router.push(`/hr/per-diem/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<WalletOutlined />}
                title="No per diem requests"
                description="Submit a request to start the approval workflow."
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
