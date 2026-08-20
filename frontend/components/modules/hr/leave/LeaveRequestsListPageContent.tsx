'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select, Tabs } from 'antd';
import { CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import LeaveRequestFormDrawer from '@/components/modules/hr/leave/LeaveRequestFormDrawer';
import LeaveBalancesListPageContent from '@/components/modules/hr/leave/LeaveBalancesListPageContent';
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

  const leaveTypeOptions = useMemo(
    () => [
      { value: 'ANNUAL', label: t('hr.leaveType.ANNUAL') },
      { value: 'SICK', label: t('hr.leaveType.SICK') },
      { value: 'UNPAID', label: t('hr.leaveType.UNPAID') },
      { value: 'MATERNITY', label: t('hr.leaveType.MATERNITY') },
      { value: 'PATERNITY', label: t('hr.leaveType.PATERNITY') },
      { value: 'EMERGENCY', label: t('hr.leaveType.EMERGENCY') },
      { value: 'COMPASSIONATE', label: t('hr.leaveType.COMPASSIONATE') },
      { value: 'STUDY', label: t('hr.leaveType.STUDY') },
      { value: 'EXAM', label: t('hr.leaveType.EXAM') },
    ],
    [t],
  );

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

  const columns: ColumnsType<LeaveRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 120,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              render: (_: unknown, row: LeaveRequestListItem) =>
                formatLeaveEmployeeName(row.employee),
            } satisfies ColumnsType<LeaveRequestListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.leaveType'),
        dataIndex: 'leaveType',
        key: 'leaveType',
        width: 140,
        render: (value: LeaveType) => (
          <StatusBadge
            label={formatLeaveType(value, t)}
            variant={leaveTypeVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.startDate'),
        dataIndex: 'startDate',
        key: 'startDate',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 80,
        align: 'right' as const,
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: LeaveRequestStatus) => (
          <StatusBadge
            label={formatLeaveStatus(value, t)}
            variant={leaveStatusVariant(value)}
          />
        ),
      },
    ],
    [canViewHr, t],
  );

  if (!canAccess) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('pages.hr.accessDenied')}
      />
    );
  }

  const showRequestsSkeleton = listQuery.isLoading && !listQuery.data;

  const requestsPanel = showRequestsSkeleton ? (
    <PageLoadingSkeleton />
  ) : (
    <div>
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
          placeholder={t('hr.placeholder.searchRequest')}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder={t('hr.placeholder.status')}
          style={{ minWidth: 180 }}
          options={statusOptions}
          value={statusFilter}
          onChange={(value: LeaveRequestStatus[]) => {
            setStatusFilter(value);
            resetPage();
          }}
        />
        <Select
          allowClear
          placeholder={t('hr.placeholder.leaveType')}
          style={{ minWidth: 160 }}
          options={leaveTypeOptions}
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
        ) : null}
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
        {canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="ml-auto"
            onClick={() => setCreateOpen(true)}
          >
            {t('hr.buttons.newLeaveRequest')}
          </Button>
        ) : null}
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
                title={t('hr.empty.noLeaveRequests')}
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

  if (canViewHr) {
    return (
      <Tabs
        defaultActiveKey="requests"
        items={[
          {
            key: 'requests',
            label: t('hr.tabs.leaveRequests'),
            children: requestsPanel,
          },
          {
            key: 'balances',
            label: t('hr.tabs.leaveBalances'),
            children: <LeaveBalancesListPageContent />,
          },
        ]}
      />
    );
  }

  if (showRequestsSkeleton) {
    return <PageLoadingSkeleton />;
  }

  return requestsPanel;
}
