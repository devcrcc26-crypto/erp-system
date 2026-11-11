'use client';

import './leave-v2.css';

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
  EyeOutlined,
  FormOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import EvaluationListAvatar from '@/components/modules/hr/evaluation/EvaluationListAvatar';
import EvaluationStat from '@/components/modules/hr/evaluation/EvaluationStat';
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
  useCanViewTeam,
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
  downloadLeaveRequestImportTemplate,
  useDeleteLeaveRequest,
  useLeaveRequestImport,
  useLeaveRequestImportPreview,
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
import {
  DRAFT_STATUSES,
  filterLeaveRequests,
  statusesForMode,
  type StatusMode,
} from '@/lib/utils/leave-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildLeaveRequestExportSheets } from '@/lib/utils/leave-export';

const PENDING_STATUSES = statusesForMode('pending');
const APPROVED_STATUSES = statusesForMode('approved');
const REJECTED_STATUSES = statusesForMode('rejected');

/**
 * Leave requests list - Employees v2 chrome with floating stats and soft cards.
 */
export default function LeaveRequestsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const canAccess = useCanAccessLeave();
  const canViewHr = useCanViewHr();
  const canViewTeam = useCanViewTeam();
  const canManage = canViewHr;
  const canCreate = useCanCreateLeave();
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const deleteMutation = useDeleteLeaveRequest();
  const importPreview = useLeaveRequestImportPreview();
  const importCommit = useLeaveRequestImport();
  const [importOpen, setImportOpen] = useState(false);

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

  // Supervisors use the company list too; the backend scopes it to their team.
  const companyListQuery = useLeaveRequestsAll(fetchParams, canViewTeam);
  const myListQuery = useMyLeaveRequestsAll(
    fetchParams,
    !canViewTeam && canAccess,
  );
  const listQuery = canViewTeam ? companyListQuery : myListQuery;

  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const allRows = listQuery.data ?? [];

  // HR picks from the directory; supervisors from the people in their list.
  const employeeOptions = useMemo(
    () =>
      canViewHr
        ? (usersQuery.data?.data ?? []).map((user) => ({
            value: user.id,
            label: formatUserName(user),
          }))
        : teamEmployeeOptions(allRows),
    [canViewHr, usersQuery.data, allRows],
  );

  const statusCounts = useMemo(() => {
    const draft = allRows.filter((row) =>
      DRAFT_STATUSES.includes(row.status),
    ).length;
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
      draft,
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
        employeeId: canViewTeam ? employeeId : undefined,
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
      canViewTeam,
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

  const pageTitle = canViewTeam
    ? t('pages.hr.leave.listTitle')
    : t('pages.hr.leave.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.leave.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
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

  function buildActionMenu(record: LeaveRequestListItem): MenuProps['items'] {
    const items: MenuProps['items'] = [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: t('common.view'),
        onClick: () => router.push(`/hr/leave-requests/${record.id}`),
      },
    ];
    if (canManage) {
      const canEditRow =
        record.status === 'DRAFT' || record.status === 'RETURNED';
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
    }
    return items;
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
      ...(canViewTeam
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: isCompact ? 200 : 240,
              responsive: ['md'] as const,
              render: (_: unknown, row: LeaveRequestListItem) => {
                const employee = row.employee;
                if (!employee) {
                  return <span className="erp-users-cell-sub">-</span>;
                }
                return (
                  <div className="erp-leave-person">
                    <EvaluationListAvatar
                      firstName={employee.firstName}
                      lastName={employee.lastName}
                      userId={employee.id}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="erp-users-name m-0 truncate">
                        {formatLeaveEmployeeName(employee)}
                      </p>
                      {employee.email ? (
                        <p className="erp-users-email m-0 mt-0.5 truncate">
                          {employee.email}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              },
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
          <span className="erp-leave-date erp-leave-date--strong">
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
          <span className="erp-leave-date">{formatProjectDate(value)}</span>
        ),
      },
      {
        title: t('hr.table.days'),
        dataIndex: 'days',
        key: 'days',
        width: 80,
        render: (value: number) => (
          <span className="erp-leave-days">{value}</span>
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
      {
        title: '',
        key: 'actions',
        width: 52,
        align: 'right' as const,
        render: (_: unknown, record: LeaveRequestListItem) => (
          <div
            className="erp-table-row-actions flex items-center justify-end"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Dropdown
              menu={{ items: buildActionMenu(record) }}
              trigger={['click']}
              rootClassName="erp-row-actions-menu"
            >
              <Button
                size="small"
                type="text"
                icon={<MoreOutlined />}
                aria-label={t('common.actions')}
              />
            </Dropdown>
          </div>
        ),
      },
    ],
    [canManage, canViewHr, canViewTeam, isCompact, router, t],
  );

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(leaveType) ||
    Boolean(employeeId) ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  if (!canAccess) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-leave-page erp-leave-v2">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  const showRequestsSkeleton = listQuery.isLoading && !listQuery.data;

  const requestsPanel = showRequestsSkeleton ? (
    <div className="erp-leave-loading">
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

      {importOpen ? (
        <HrImportModal
          entity="leaveRequests"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadLeaveRequestImportTemplate}
          previewMutation={importPreview}
          commitMutation={importCommit}
        />
      ) : null}

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
        <EvaluationStat
          label={t('pages.hr.leave.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<CalendarOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        {!canViewHr ? (
          <EvaluationStat
            label={t('pages.hr.leave.stats.draft')}
            value={statusCounts.draft}
            accent="blue"
            icon={<FormOutlined />}
            active={statusMode === 'draft'}
            onClick={() => handleStatusMode('draft')}
          />
        ) : null}
        <EvaluationStat
          label={t('pages.hr.leave.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <EvaluationStat
          label={t('pages.hr.leave.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <EvaluationStat
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
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'export',
                  filePrefix: 'leave-requests',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildLeaveRequestExportSheets(filtered),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                canCreate
                  ? {
                      label: t('hr.buttons.newLeaveRequest'),
                      onClick: () => router.push('/approvals/new/leave-request'),
                    }
                  : undefined
              }
            />
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
          {canViewTeam ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              className="erp-users-filter-select"
              loading={canViewHr ? usersQuery.isLoading : listQuery.isLoading}
              options={employeeOptions}
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
      <div className="erp-pro-list-page erp-users-page erp-leave-page erp-leave-v2">
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
    <div className="erp-pro-list-page erp-users-page erp-leave-page erp-leave-v2">
      {requestsPanel}
    </div>
  );
}
