'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select } from 'antd';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, {
  PageLoadingSkeleton,
} from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  LeaveRequestListItem,
  LeaveRequestStatus,
  LeaveType,
} from '@/lib/api/leave.types';
import { useLeaveRequests } from '@/lib/query/leave';
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

/**
 * Company leave request list with filters.
 */
export default function LeaveRequestsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      leaveType,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [params, search, statusFilter, leaveType, dateRange],
  );

  const listQuery = useLeaveRequests(listParams);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<LeaveRequestListItem> = [
    {
      title: 'Request #',
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 120,
    },
    {
      title: 'Employee',
      key: 'employee',
      render: (_, row) => formatLeaveEmployeeName(row.employee),
    },
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

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <FormLayout
      title="Leave Requests"
      description="Submit and track employee leave through the approval workflow."
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push('/hr/leave-requests/new')}
        >
          New Request
        </Button>
      }
    >
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

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
    </FormLayout>
  );
}
