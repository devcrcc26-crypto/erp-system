'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { ClockCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import {
  useCanAccessOvertime,
  useCanCreateOvertime,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  OvertimeSheetListItem,
  OvertimeSheetStatus,
} from '@/lib/api/overtime.types';
import { useOvertimeSheets } from '@/lib/query/overtime';
import { useUsersDirectory } from '@/lib/query/users';
import {
  OVERTIME_MONTH_OPTIONS,
  OVERTIME_STATUS_OPTIONS,
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Company or personal overtime monthly sheet list.
 */
export default function OvertimeSheetsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const canAccess = useCanAccessOvertime();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateOvertime();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OvertimeSheetStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [year, setYear] = useState<number | undefined>();

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      employeeId: canViewHr ? employeeId : undefined,
      month,
      year,
    }),
    [params, search, statusFilter, employeeId, month, year, canViewHr],
  );

  const listQuery = useOvertimeSheets(listParams, canAccess);

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => current - i);
  }, []);

  const columns: ColumnsType<OvertimeSheetListItem> = [
    {
      title: 'Sheet #',
      dataIndex: 'sheetNumber',
      key: 'sheetNumber',
      width: 140,
      render: (value: string) => (
        <span className="font-medium text-[var(--color-text-primary)]">
          {value}
        </span>
      ),
    },
    ...(canViewHr
      ? [
          {
            title: 'Employee',
            key: 'employee',
            width: 180,
            render: (_: unknown, row: OvertimeSheetListItem) =>
              formatOvertimeEmployeeName(row.employee),
          } satisfies ColumnsType<OvertimeSheetListItem>[number],
        ]
      : []),
    {
      title: 'Period',
      key: 'period',
      width: 140,
      render: (_, row) => formatOvertimePeriod(row.month, row.year),
    },
    {
      title: 'Regular',
      dataIndex: 'totalRegularHours',
      key: 'totalRegularHours',
      width: 90,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Night',
      dataIndex: 'totalNightHours',
      key: 'totalNightHours',
      width: 90,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Weekend',
      dataIndex: 'totalWeekendHours',
      key: 'totalWeekendHours',
      width: 90,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Holiday',
      dataIndex: 'totalHolidayHours',
      key: 'totalHolidayHours',
      width: 90,
      align: 'right',
      render: (v: number) => formatOvertimeHours(v),
    },
    {
      title: 'Total',
      dataIndex: 'totalHours',
      key: 'totalHours',
      width: 90,
      align: 'right',
      render: (v: number) => (
        <span className="font-medium">{formatOvertimeHours(v)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: OvertimeSheetStatus) => (
        <StatusBadge
          label={formatOvertimeStatus(value)}
          variant={overtimeStatusVariant(value)}
        />
      ),
    },
    {
      title: 'Tier',
      key: 'tier',
      width: 80,
      render: (_, row) =>
        row.approvalRequest?.currentTier != null
          ? String(row.approvalRequest.currentTier)
          : '—',
    },
  ];

  if (!canAccess) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have permission to view overtime sheets."
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  if (listQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={
          listQuery.error instanceof ApiRequestError
            ? listQuery.error.message
            : 'Failed to load overtime sheets'
        }
      />
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {canViewHr
              ? t('pages.hr.overtime.listTitle')
              : t('pages.hr.overtime.myListTitle')}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {canViewHr
              ? t('pages.hr.overtime.listDescription')
              : t('pages.hr.overtime.myListDescription')}
          </p>
        </div>
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/overtime')}
          >
            {t('pages.hr.overtime.new')}
          </Button>
        ) : null}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value: string) => {
            setSearch(value);
            resetPage();
          }}
          placeholder="Search sheet number"
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Status"
          style={{ minWidth: 180 }}
          options={OVERTIME_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value: OvertimeSheetStatus[]) => {
            setStatusFilter(value);
            resetPage();
          }}
        />
        {canViewHr ? (
          <Select
            allowClear
            showSearch
            placeholder="Employee"
            style={{ minWidth: 200 }}
            optionFilterProp="label"
            value={employeeId}
            onChange={(value: string | undefined) => {
              setEmployeeId(value);
              resetPage();
            }}
            options={(usersQuery.data?.data ?? []).map((u) => ({
              value: u.id,
              label: formatUserName(u),
            }))}
          />
        ) : null}
        <Select
          allowClear
          placeholder="Month"
          style={{ minWidth: 140 }}
          options={OVERTIME_MONTH_OPTIONS}
          value={month}
          onChange={(value: number | undefined) => {
            setMonth(value);
            resetPage();
          }}
        />
        <Select
          allowClear
          placeholder="Year"
          style={{ minWidth: 110 }}
          options={yearOptions.map((y) => ({ value: y, label: String(y) }))}
          value={year}
          onChange={(value: number | undefined) => {
            setYear(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator
          active={listQuery.isFetching && Boolean(listQuery.data)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<OvertimeSheetListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching && !listQuery.data}
          onRow={(record) => ({
            onClick: () => router.push(`/hr/overtime/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<ClockCircleOutlined />}
                title="No overtime sheets"
                description="Open this month's sheet to start logging overtime."
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>
    </div>
  );
}
