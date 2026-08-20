'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Input, Select, Space, Spin, Tabs } from 'antd';
import { CalendarOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import LeaveBalancesListPageContent from '@/components/modules/hr/leave/LeaveBalancesListPageContent';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
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
 * Company or personal leave request list with Pro filter/table layout.
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
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const listParams = useMemo(
    () => ({
      ...params,
      search: appliedSearch.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      leaveType,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [
      params,
      appliedSearch,
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

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusFilter([]);
    setLeaveType(undefined);
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleQuery(): void {
    setAppliedSearch(search.trim());
    resetPage();
  }

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const showRequestsSkeleton = listQuery.isLoading && !listQuery.data;

  const requestsPanel = showRequestsSkeleton ? (
    <div className="erp-pro-card">
      <div className="flex justify-center p-12">
        <Spin />
      </div>
    </div>
  ) : (
    <>
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadLeaveRequests')
          }
        />
      ) : null}

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
                  placeholder={t('hr.placeholder.searchRequest')}
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
                  {t('common.status')}
                </span>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder={t('hr.placeholder.status')}
                  style={{ width: '100%', minWidth: 160 }}
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(value: LeaveRequestStatus[]) => {
                    setStatusFilter(value);
                    resetPage();
                  }}
                />
              </div>
              <div className="erp-pro-filter-field">
                <span className="erp-pro-filter-field-label">
                  {t('hr.form.leaveType')}
                </span>
                <Select
                  allowClear
                  placeholder={t('hr.placeholder.leaveType')}
                  style={{ width: '100%', minWidth: 140 }}
                  options={leaveTypeOptions}
                  value={leaveType}
                  onChange={(value: LeaveType | undefined) => {
                    setLeaveType(value);
                    resetPage();
                  }}
                />
              </div>
              {canViewHr ? (
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
              ) : null}
              <div className="erp-pro-filter-field">
                <span className="erp-pro-filter-field-label">
                  {t('hr.form.leaveDates')}
                </span>
                <DatePicker.RangePicker
                  value={dateRange}
                  style={{ width: '100%' }}
                  onChange={(value) => {
                    setDateRange(value);
                    resetPage();
                  }}
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

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar">
          <h1
            className="erp-pro-card-toolbar-title"
            style={{ fontSize: 16, fontWeight: 600 }}
          >
            {canViewHr
              ? t('pages.hr.leave.listTitle')
              : t('pages.hr.leave.myListTitle')}
          </h1>
          <Space wrap size={8}>
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/leave-request')}
                style={{ borderRadius: 2 }}
              >
                {t('hr.buttons.newLeaveRequest')}
              </Button>
            ) : null}
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 2 }}
            />
          </Space>
        </div>
        <div className="erp-pro-table-card-body">
          <DataTable<LeaveRequestListItem>
            rowKey="id"
            className="erp-pro-table"
            size="middle"
            columns={columns}
            dataSource={rows}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/leave-requests/${record.id}`),
              style: { cursor: 'pointer' },
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CalendarOutlined />}
                  title={t('hr.empty.noLeaveRequests')}
                  description={t('pages.hr.leave.listDescription')}
                  action={
                    canCreate
                      ? {
                          label: t('hr.buttons.newLeaveRequest'),
                          onClick: () =>
                            router.push('/approvals/new/leave-request'),
                        }
                      : undefined
                  }
                />
              ),
            }}
            pagination={bindMeta(meta)}
          />
        </div>
      </div>
    </>
  );

  if (canViewHr) {
    return (
      <div className="erp-pro-list-page">
        <Tabs
          defaultActiveKey="requests"
          className="erp-pro-tabs"
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
      </div>
    );
  }

  return <div className="erp-pro-list-page">{requestsPanel}</div>;
}
