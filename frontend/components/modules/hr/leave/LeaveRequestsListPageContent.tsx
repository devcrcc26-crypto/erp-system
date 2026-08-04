'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select } from 'antd';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import LeaveRequestFormDrawer from '@/components/modules/hr/leave/LeaveRequestFormDrawer';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import {
  useCanAccessLeave,
  useCanCreateLeave,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  LeaveRequestListItem,
  LeaveRequestStatus,
  LeaveType,
} from '@/lib/api/leave.types';
import { useLeaveRequests, useMyLeaveRequests } from '@/lib/query/leave';
import { useUsersDirectory } from '@/lib/query/users';
import {
  LEAVE_STATUS_OPTIONS,
  LEAVE_TYPE_OPTIONS,
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Company or personal leave request list with filters.
 */
export default function LeaveRequestsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const canAccess = useCanAccessLeave();
  const canViewHr = useCanViewHr();
  const canCreate = useCanCreateLeave();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [createOpen, setCreateOpen] = useState(false);

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      leaveType,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [
      params,
      search,
      statusFilter,
      leaveType,
      employeeId,
      dateRange,
      canViewHr,
    ],
  );

  const companyListQuery = useLeaveRequests(listParams, canViewHr);
  const myListQuery = useMyLeaveRequests(
    listParams,
    !canViewHr && canAccess,
  );
  const listQuery = canViewHr ? companyListQuery : myListQuery;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<LeaveRequestListItem> = [
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
            render: (_: unknown, row: LeaveRequestListItem) =>
              formatLeaveEmployeeName(row.employee),
          } satisfies ColumnsType<LeaveRequestListItem>[number],
        ]
      : []),
    {
      title: 'Leave type',
      dataIndex: 'leaveType',
      key: 'leaveType',
      width: 140,
      render: (value: LeaveType) => (
        <StatusBadge
          label={formatLeaveType(value)}
          variant={leaveTypeVariant(value)}
        />
      ),
    },
    {
      title: 'Start',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 120,
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: 'End',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 120,
      render: (value: string) => formatProjectDate(value),
    },
    {
      title: 'Days',
      dataIndex: 'days',
      key: 'days',
      width: 80,
      align: 'right',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: LeaveRequestStatus) => (
        <StatusBadge
          label={formatLeaveStatus(value)}
          variant={leaveStatusVariant(value)}
        />
      ),
    },
  ];

  if (!canAccess) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.hr.accessDenied')}
      />
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {canViewHr
              ? t('pages.hr.leave.listTitle')
              : t('pages.hr.leave.myListTitle')}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {canViewHr
              ? t('pages.hr.leave.listDescription')
              : t('pages.hr.leave.myListDescription')}
          </p>
        </div>
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            {t('pages.hr.leave.new')}
          </Button>
        ) : null}
      </div>

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load leave requests'
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
          placeholder="Search request # or reason"
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Status"
          style={{ minWidth: 180 }}
          options={LEAVE_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(value: LeaveRequestStatus[]) => {
            setStatusFilter(value);
            resetPage();
          }}
        />
        <Select
          allowClear
          placeholder="Leave type"
          style={{ minWidth: 160 }}
          options={LEAVE_TYPE_OPTIONS}
          value={leaveType}
          onChange={(value: LeaveType | undefined) => {
            setLeaveType(value);
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
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[rgba(0,0,0,0.08)] overflow-hidden">
        <DataTable<LeaveRequestListItem>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={listQuery.isFetching}
          onRow={(record) => ({
            onClick: () => router.push(`/hr/leave-requests/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <TableEmptyState
                icon={<CalendarOutlined />}
                title="No leave requests"
                description="Create a leave request to start the approval flow."
              />
            ),
          }}
          pagination={bindMeta(meta)}
        />
      </div>

      <LeaveRequestFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmitted={() => void listQuery.refetch()}
      />
    </div>
  );
}
