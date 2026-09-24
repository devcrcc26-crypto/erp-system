'use client';

import { useMemo, useState } from 'react';
import { Button, InputNumber, Select, Spin } from 'antd';
import {
  ClockCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  FieldMovementLog,
  FieldMovementStatus,
} from '@/lib/api/attendance.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useFieldMovementLogs } from '@/lib/query/attendance';
import { useUsersDirectory } from '@/lib/query/users';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatUserName } from '@/lib/utils/user-display';

const STATUS_OPTIONS: FieldMovementStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2026, index, 1).toLocaleString('en', { month: 'long' }),
}));

function statusVariant(status: FieldMovementStatus): StatusBadgeVariant {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'CANCELLED':
      return 'error';
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'info';
    case 'RETURNED':
      return 'warning';
    default:
      return 'default';
  }
}

function formatStatus(status: FieldMovementStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * HR list of field movement / early departure log submissions.
 */
export default function FieldMovementLogsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(20);

  const now = new Date();
  const [month, setMonth] = useState<number | undefined>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [status, setStatus] = useState<FieldMovementStatus | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();

  const listQuery = useFieldMovementLogs(
    {
      page: params.page,
      limit: params.limit,
      month,
      year,
      status,
      employeeId: canViewHr ? employeeId : undefined,
    },
    true,
  );

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta: PaginationMeta = {
    total: listQuery.data?.total ?? 0,
    page: listQuery.data?.page ?? params.page ?? 1,
    limit: listQuery.data?.limit ?? params.limit ?? 20,
    pages: Math.max(
      1,
      Math.ceil((listQuery.data?.total ?? 0) / (listQuery.data?.limit ?? 20)) ||
        1,
    ),
  };

  const employeeOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? []).map((user) => ({
        value: user.id,
        label: formatUserName(user),
      })),
    [usersQuery.data?.data],
  );

  const columns: ColumnsType<FieldMovementLog> = [
    {
      title: 'Request #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 120,
      render: (value: string) => (
        <span className="erp-users-cell-strong">{value}</span>
      ),
    },
    {
      title: 'Employee',
      key: 'employee',
      width: 200,
      render: (_: unknown, row: FieldMovementLog) =>
        row.employee
          ? formatUserName(row.employee)
          : '—',
    },
    {
      title: 'Period',
      key: 'period',
      width: 140,
      render: (_: unknown, row: FieldMovementLog) => {
        const name = new Date(row.year, row.month - 1, 1).toLocaleString('en', {
          month: 'short',
        });
        return `${name} ${row.year}`;
      },
    },
    {
      title: 'Entries',
      key: 'entryCount',
      width: 90,
      align: 'right',
      render: (_: unknown, row: FieldMovementLog) => row.entryCount ?? '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: FieldMovementStatus) => (
        <StatusBadge label={formatStatus(value)} variant={statusVariant(value)} />
      ),
    },
    {
      title: 'Current tier',
      key: 'currentTierLabel',
      width: 160,
      render: (_: unknown, row: FieldMovementLog) =>
        row.currentTierLabel ?? '—',
    },
    {
      title: 'Submitted',
      key: 'submittedAt',
      width: 140,
      render: (_: unknown, row: FieldMovementLog) =>
        row.submittedAt
          ? new Date(row.submittedAt).toLocaleDateString('en-GB')
          : '—',
    },
  ];

  if (!canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page">
        <ErpNotice
          tone="error"
          title={t('pages.hr.accessDenied')}
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-lg font-semibold text-[#1A1A1A]">
            Field Movement Logs
          </h1>
          <p className="m-0 mt-1 text-sm text-[#6B7280]">
            Employee explanations for flagged attendance days.
          </p>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void listQuery.refetch()}
        >
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          allowClear
          placeholder="Month"
          style={{ width: 140 }}
          value={month}
          options={MONTH_OPTIONS}
          onChange={(value) => {
            setMonth(value);
            resetPage();
          }}
        />
        <InputNumber
          min={2020}
          max={now.getFullYear() + 1}
          value={year}
          onChange={(value) => {
            if (typeof value === 'number') {
              setYear(value);
              resetPage();
            }
          }}
        />
        <Select
          allowClear
          placeholder="Status"
          style={{ width: 160 }}
          value={status}
          options={STATUS_OPTIONS.map((item) => ({
            value: item,
            label: formatStatus(item),
          }))}
          onChange={(value) => {
            setStatus(value);
            resetPage();
          }}
        />
        <Select
          allowClear
          showSearch
          placeholder="Employee"
          style={{ minWidth: 220 }}
          optionFilterProp="label"
          value={employeeId}
          options={employeeOptions}
          suffixIcon={<SearchOutlined />}
          onChange={(value) => {
            setEmployeeId(value);
            resetPage();
          }}
        />
      </div>

      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            'Failed to load field movement logs',
            t,
          )}
        />
      ) : listQuery.isLoading && rows.length === 0 ? (
        <div className="flex justify-center p-12">
          <Spin />
        </div>
      ) : (
        <DataTable<FieldMovementLog>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          pagination={bindMeta(meta)}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ClockCircleOutlined />}
                title="No field movement logs"
                description="No submissions match the current filters."
              />
            ),
          }}
          onRow={(row) => ({
            onClick: () => {
              if (row.approvalRequestId) {
                router.push(`/approvals/${row.approvalRequestId}`);
              }
            },
            className: row.approvalRequestId ? 'cursor-pointer' : undefined,
          })}
        />
      )}
    </div>
  );
}
