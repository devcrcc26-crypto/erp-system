'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tabs,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import LeaveBalancesListPageContent from '@/components/modules/hr/leave/LeaveBalancesListPageContent';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
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
import type { PaginationMeta } from '@/lib/api/types';
import {
  useDeleteLeaveRequest,
  useLeaveRequestsAll,
  useMyLeaveRequestsAll,
} from '@/lib/query/leave';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
  leaveStatusVariant,
  leaveTypeVariant,
} from '@/lib/utils/leave-display';
import { filterLeaveRequests } from '@/lib/utils/leave-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';
import { tokens } from '@/lib/theme/tokens';

type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: LeaveRequestStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: LeaveRequestStatus[] = ['APPROVED'];
const REJECTED_STATUSES: LeaveRequestStatus[] = ['REJECTED', 'CANCELLED'];

function statusesForMode(mode: StatusMode): LeaveRequestStatus[] {
  switch (mode) {
    case 'pending':
      return PENDING_STATUSES;
    case 'approved':
      return APPROVED_STATUSES;
    case 'rejected':
      return REJECTED_STATUSES;
    default:
      return [];
  }
}

/**
 * Company or personal leave request list — layout aligned with Users page.
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

  const canAccess = useCanAccessLeave();
  const canViewHr = useCanViewHr();
  /** HR / System Admin (hr.view) may edit/delete company leave requests. */
  const canManage = canViewHr;
  const canCreate = useCanCreateLeave();
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const deleteMutation = useDeleteLeaveRequest();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
  const [leaveType, setLeaveType] = useState<LeaveType | undefined>();
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'requests' | 'balances'>(
    'requests',
  );
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);
  const [deletingRequest, setDeletingRequest] =
    useState<LeaveRequestListItem | null>(null);

  const fetchParams = useMemo(
    () => ({
      leaveType,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [leaveType, employeeId, dateRange, canViewHr],
  );

  const companyListQuery = useLeaveRequestsAll(fetchParams, canViewHr);
  const myListQuery = useMyLeaveRequestsAll(
    fetchParams,
    !canViewHr && canAccess,
  );
  const listQuery = canViewHr ? companyListQuery : myListQuery;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    const pending = allRows.filter((row) =>
      PENDING_STATUSES.includes(row.status),
    ).length;
    const approved = allRows.filter((row) =>
      APPROVED_STATUSES.includes(row.status),
    ).length;
    const rejected = allRows.filter((row) =>
      REJECTED_STATUSES.includes(row.status),
    ).length;
    return {
      all: allRows.length,
      pending,
      approved,
      rejected,
    };
  }, [allRows]);

  const filtered = useMemo(
    () =>
      filterLeaveRequests(allRows, {
        search: appliedSearch,
        statuses: statusesForMode(statusMode),
        leaveType,
        employeeId: canViewHr ? employeeId : undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [
      allRows,
      appliedSearch,
      statusMode,
      leaveType,
      employeeId,
      dateRange,
      canViewHr,
    ],
  );

  const meta: PaginationMeta = useMemo(() => {
    const total = filtered.length;
    const limit = params.limit ?? 10;
    const page = params.page ?? 1;
    return {
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }, [filtered.length, params.limit, params.page]);

  const rows = useMemo(() => {
    const start = (meta.page - 1) * meta.limit;
    return filtered.slice(start, start + meta.limit);
  }, [filtered, meta.page, meta.limit]);

  const totalCount = meta.total;

  const columns: ColumnsType<LeaveRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
        render: (value: string) => (
          <span
            className="font-[family-name:var(--font-mono)] text-xs font-medium"
            style={{ color: tokens.colorPrimary }}
          >
            {value}
          </span>
        ),
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 220,
              responsive: ['md'],
              render: (_: unknown, row: LeaveRequestListItem) => (
                <div className="min-w-0">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatLeaveEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p
                      className="m-0 truncate text-xs"
                      style={{ color: tokens.colorTextTertiary }}
                    >
                      {row.employee.email}
                    </p>
                  ) : null}
                </div>
              ),
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
        width: 140,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 140,
        responsive: ['md'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 140,
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (value: LeaveRequestStatus) => (
          <StatusBadge
            label={formatLeaveStatus(value, t)}
            variant={leaveStatusVariant(value)}
          />
        ),
      },
      ...(canManage
        ? [
            {
              title: '',
              key: 'actions',
              width: 56,
              render: (_: unknown, record: LeaveRequestListItem) => {
                const canEditRow =
                  record.status === 'DRAFT' || record.status === 'RETURNED';
                const items: MenuProps['items'] = [];
                if (canEditRow) {
                  items.push({
                    key: 'update',
                    icon: <EditOutlined />,
                    label: t('common.update'),
                    onClick: () =>
                      router.push(`/hr/leave-requests/${record.id}/edit`),
                  });
                }
                items.push({
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: t('common.delete'),
                  danger: true,
                  onClick: () => setDeletingRequest(record),
                });
                return (
                  <div
                    className="flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown menu={{ items }} trigger={['click']}>
                      <Button
                        size="small"
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
                        style={{ borderRadius: 0 }}
                      />
                    </Dropdown>
                  </div>
                );
              },
            } satisfies ColumnsType<LeaveRequestListItem>[number],
          ]
        : []),
    ],
    [canManage, canViewHr, router, t],
  );

  async function handleDeleteRequest(): Promise<void> {
    if (!deletingRequest) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deletingRequest.id);
      messageApi.success(t('hr.messages.leaveRequestDeleted'));
      setDeletingRequest(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteLeaveRequest'),
        messageApi,
      );
    }
  }

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setLeaveType(undefined);
    setDateRange(null);
    setEmployeeId(undefined);
    resetPage();
  }

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(leaveType) ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  if (!canAccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const showRequestsSkeleton = listQuery.isLoading && !listQuery.data;

  const pageTitle = canViewHr
    ? t('pages.hr.leave.listTitle')
    : t('pages.hr.leave.myListTitle');

  const requestsPanel = showRequestsSkeleton ? (
    <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
      <Spin />
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={Boolean(deletingRequest)}
        title={t('hr.empty.deleteLeaveTitle')}
        description={t('hr.empty.deleteLeaveDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteRequest()}
        onCancel={() => setDeletingRequest(null)}
      />

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadLeaveRequests')
          }
        />
      ) : null}

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label="Total"
            value={statusCounts.all}
            color="teal"
            icon={<CalendarOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('pending')}
        >
          <StatCard
            label="Pending"
            value={statusCounts.pending}
            color="amber"
            icon={<ClockCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('approved')}
        >
          <StatCard
            label="Approved"
            value={statusCounts.approved}
            color="green"
            icon={<CheckCircleOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('rejected')}
        >
          <StatCard
            label="Rejected"
            value={statusCounts.rejected}
            color="red"
            icon={<CloseCircleOutlined />}
          />
        </button>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('hr.placeholder.searchRequest')}
            className="w-full min-w-0 sm:w-72"
            allowClear
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onSearch={(value) => {
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <Select
            placeholder={t('hr.placeholder.leaveType')}
            className="w-full min-w-0 sm:w-40"
            allowClear
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
              className="w-full min-w-0 sm:w-48"
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
            className="w-full min-w-0 sm:w-[260px]"
            onChange={(value) => {
              setDateRange(value);
              resetPage();
            }}
          />
          <Button
            onClick={handleResetFilters}
            disabled={!hasFilters}
            style={{ borderRadius: 0 }}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void listQuery.refetch()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CalendarOutlined style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {pageTitle}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {totalCount}{' '}
              {totalCount === 1 ? 'request' : 'requests'}
            </span>
          </div>
          <Space wrap size={8}>
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/leave-request')}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.newLeaveRequest')}
              </Button>
            ) : null}
          </Space>
        </div>

        <div className="px-0">
          <DataTable<LeaveRequestListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/leave-requests/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CalendarOutlined />}
                  title={t('hr.empty.noLeaveRequests')}
                  description={t('pages.hr.leave.listDescription')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : canCreate
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
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
          />
        </div>
      </div>
    </div>
  );

  if (canViewHr) {
    return (
      <div className="flex flex-col gap-4">
        <Tabs
          className="erp-list-tabs"
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'requests' | 'balances')}
          items={[
            {
              key: 'requests',
              label: (
                <span className="flex items-center gap-2">
                  <CalendarOutlined />
                  {t('hr.tabs.leaveRequests')}
                </span>
              ),
              children: requestsPanel,
            },
            {
              key: 'balances',
              label: (
                <span className="flex items-center gap-2">
                  <WalletOutlined />
                  {t('hr.tabs.leaveBalances')}
                </span>
              ),
              children: <LeaveBalancesListPageContent />,
            },
          ]}
        />
      </div>
    );
  }

  return requestsPanel;
}
