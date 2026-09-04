'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Dropdown,
  Grid,
  Input,
  Select,
  Spin,
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
  SearchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import LeaveBalancesListPageContent from '@/components/modules/hr/leave/LeaveBalancesListPageContent';
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

type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: LeaveRequestStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: LeaveRequestStatus[] = ['APPROVED'];
const REJECTED_STATUSES: LeaveRequestStatus[] = ['REJECTED', 'CANCELLED'];

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

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

function LeaveStat({
  label,
  value,
  accent,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent: keyof typeof STAT_ACCENT;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}): React.ReactNode {
  const tint = STAT_ACCENT[accent];
  return (
    <button
      type="button"
      className={`erp-users-stat erp-contract-stat${active ? ' erp-contract-stat--active' : ''}`}
      onClick={onClick}
    >
      <span
        className="erp-users-stat-chip"
        style={{ background: tint.bg, color: tint.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 text-left">
        <p className="erp-users-stat-label">{label}</p>
        <p className="erp-users-stat-value">{value.toLocaleString()}</p>
      </div>
    </button>
  );
}

/**
 * Leave requests list - Users chrome (stat bar, filter row, rounded table).
 */
export default function LeaveRequestsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canAccess = useCanAccessLeave();
  const canViewHr = useCanViewHr();
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

  const pageTitle = canViewHr
    ? t('pages.hr.leave.listTitle')
    : t('pages.hr.leave.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.leave.listDescription')
    : t('pages.hr.leave.myListDescription');

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

  const columns: ColumnsType<LeaveRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 220,
              responsive: ['md'] as const,
              render: (_: unknown, row: LeaveRequestListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatLeaveEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
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
        width: 120,
        render: (value: string) => (
          <span className="erp-users-cell-strong">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.endDate'),
        dataIndex: 'endDate',
        key: 'endDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 80,
        render: (value: number) => (
          <span className="erp-users-cell-strong">{value}</span>
        ),
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
      ...(canManage
        ? [
            {
              title: '',
              key: 'actions',
              width: 52,
              align: 'right' as const,
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
                    className="erp-table-row-actions flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown menu={{ items }} trigger={['click']}>
                      <Button
                        size="small"
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={t('common.actions')}
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

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(leaveType) ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-leave-page">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const showRequestsSkeleton = listQuery.isLoading && !listQuery.data;

  const requestsPanel = showRequestsSkeleton ? (
    <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
      <Spin />
    </div>
  ) : (
    <>
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

      <div className="erp-users-stat-bar">
        <LeaveStat
          label={t('pages.hr.leave.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<CalendarOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <LeaveStat
          label={t('pages.hr.leave.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <LeaveStat
          label={t('pages.hr.leave.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <LeaveStat
          label={t('pages.hr.leave.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">{pageTitle}</h3>
            <span className="erp-users-count-pill">
              {meta.total.toLocaleString()}
            </span>
          </div>
          <div className="erp-users-toolbar-actions flex flex-wrap items-center gap-2">
            <Tooltip title={t('common.refresh')}>
              <Button
                type="text"
                icon={<ReloadOutlined />}
                loading={listQuery.isFetching && !listQuery.isLoading}
                onClick={() => void listQuery.refetch()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            {canCreate ? (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/leave-request')}
              >
                {t('hr.buttons.newLeaveRequest')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('hr.placeholder.searchRequest')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              setAppliedSearch(value.trim());
              resetPage();
            }}
            onPressEnter={() => {
              setAppliedSearch(search.trim());
              resetPage();
            }}
            onClear={() => {
              setSearch('');
              setAppliedSearch('');
              resetPage();
            }}
          />
          <span className="erp-users-filter-spacer" aria-hidden />
          <Select
            allowClear
            placeholder={t('hr.placeholder.leaveType')}
            className="erp-users-filter-select"
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
              className="erp-users-filter-select"
              loading={usersQuery.isLoading}
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
            className="erp-users-filter-daterange"
            onChange={(value) => {
              setDateRange(value);
              resetPage();
            }}
          />
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<LeaveRequestListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            scroll={{ x: isCompact ? 640 : 980 }}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/leave-requests/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CalendarOutlined />}
                  title={
                    hasFilters
                      ? t('hr.empty.noLeaveRequests')
                      : t('hr.empty.noLeaveRequests')
                  }
                  description={pageDescription}
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
              simple: screens.sm === false,
              showSizeChanger: screens.sm !== false,
            }}
          />
        </div>
      </div>
    </>
  );

  if (canViewHr) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-leave-page">
        <div className="erp-pro-card">
          <div className="erp-profile-tabbar erp-employee-tabbar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
            >
              <CalendarOutlined />
              <span className="erp-employee-tab-label">
                {t('hr.tabs.leaveRequests')}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'balances'}
              onClick={() => setActiveTab('balances')}
            >
              <WalletOutlined />
              <span className="erp-employee-tab-label">
                {t('hr.tabs.leaveBalances')}
              </span>
            </button>
          </div>
        </div>

        <div className="erp-leave-tab-panel">
          {activeTab === 'requests' ? requestsPanel : <LeaveBalancesListPageContent />}
        </div>
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-leave-page">
      {requestsPanel}
    </div>
  );
}
