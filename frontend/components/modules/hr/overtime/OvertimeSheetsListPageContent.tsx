'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessOvertime,
  useCanCreateOvertime,
  useCanViewHr,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeSheetListItem } from '@/lib/api/overtime.types';
import type { PaginationMeta } from '@/lib/api/types';
import { useDeleteOvertimeSheet, useOvertimeSheetsAll } from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import {
  filterOvertimeSheets,
  statusesForOvertimeMode,
  type OvertimeStatusMode,
} from '@/lib/utils/overtime-list-filter';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName } from '@/lib/utils/user-display';
import SectionPageHeader from '@/components/ui/SectionPageHeader/SectionPageHeader';

function isEditableSheetStatus(status: OvertimeSheetListItem['status']): boolean {
  return status === 'DRAFT' || status === 'RETURNED';
}

const PENDING_STATUSES = statusesForOvertimeMode('pending');
const APPROVED_STATUSES = statusesForOvertimeMode('approved');
const REJECTED_STATUSES = statusesForOvertimeMode('rejected');

/**
 * Company or personal overtime sheet list — layout aligned with Users page.
 */
export default function OvertimeSheetsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();

  const canAccess = useCanAccessOvertime();
  const canViewHr = useCanViewHr();
  const canManage = canViewHr;
  const canCreate = useCanCreateOvertime();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id;
  const deleteMutation = useDeleteOvertimeSheet();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<OvertimeStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [year, setYear] = useState<number | undefined>();
  const [deletingSheet, setDeletingSheet] =
    useState<OvertimeSheetListItem | null>(null);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: t(`hr.months.${i + 1}`),
      })),
    [t],
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => current - i);
  }, []);

  const listQuery = useOvertimeSheetsAll({}, canAccess);

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
      filterOvertimeSheets(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewHr ? employeeId : undefined,
        month,
        year,
      }),
    [allRows, appliedSearch, statusMode, employeeId, month, year, canViewHr],
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
    ? t('pages.hr.overtime.listTitle')
    : t('pages.hr.overtime.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.overtime.listDescription')
    : t('pages.hr.overtime.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    setMonth(undefined);
    setYear(undefined);
    resetPage();
  }

  function handleStatusMode(mode: OvertimeStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId) ||
    month != null ||
    year != null;

  function buildActionMenu(row: OvertimeSheetListItem): MenuProps['items'] {
    const isOwner = Boolean(currentUserId) && row.employeeId === currentUserId;
    const canEditRow =
      isEditableSheetStatus(row.status) && (canManage || isOwner);
    const items: MenuProps['items'] = [];
    if (canEditRow) {
      items.push({
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`/hr/overtime/${row.id}`),
      });
    }
    if (canManage) {
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeletingSheet(row),
      });
    }
    return items;
  }

  async function handleDeleteSheet(): Promise<void> {
    if (!deletingSheet) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deletingSheet.id);
      messageApi.success(t('hr.messages.overtimeSheetDeleted'));
      setDeletingSheet(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteOvertimeSheet'),
        messageApi,
      );
    }
  }

  const columns: ColumnsType<OvertimeSheetListItem> = useMemo(
    () => [
      {
        title: t('hr.table.sheetNumber'),
        dataIndex: 'sheetNumber',
        key: 'sheetNumber',
        width: 140,
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
              render: (_: unknown, row: OvertimeSheetListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatOvertimeEmployeeName(row.employee)}
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
            } satisfies ColumnsType<OvertimeSheetListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.period'),
        key: 'period',
        width: 140,
        responsive: ['md'],
        render: (_: unknown, row: OvertimeSheetListItem) =>
          formatOvertimePeriod(row.month, row.year, t),
      },
      {
        title: t('hr.table.regularHours'),
        dataIndex: 'totalRegularHours',
        key: 'totalRegularHours',
        width: 90,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.table.nightHours'),
        dataIndex: 'totalNightHours',
        key: 'totalNightHours',
        width: 90,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.table.weekendHours'),
        dataIndex: 'totalWeekendHours',
        key: 'totalWeekendHours',
        width: 90,
        align: 'right',
        responsive: ['xl'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.table.holidayHours'),
        dataIndex: 'totalHolidayHours',
        key: 'totalHolidayHours',
        width: 90,
        align: 'right',
        responsive: ['xl'],
        render: (value: number) => formatOvertimeHours(value),
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalHours',
        key: 'totalHours',
        width: 90,
        align: 'right',
        render: (value: number) => (
          <span className="text-sm font-medium">{formatOvertimeHours(value)}</span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: OvertimeSheetListItem['status']) => (
          <StatusBadge
            label={formatOvertimeStatus(value, t)}
            variant={overtimeStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        key: 'tier',
        width: 80,
        responsive: ['lg'],
        render: (_: unknown, row: OvertimeSheetListItem) =>
          row.approvalRequest?.currentTier != null
            ? String(row.approvalRequest.currentTier)
            : '—',
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        render: (_: unknown, row: OvertimeSheetListItem) => {
          const items = buildActionMenu(row);
          if (!items || items.length === 0) {
            return null;
          }
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
      },
    ],
    [canManage, canViewHr, currentUserId, router, t],
  );

  if (!canAccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.failedToLoadOvertimeSheets')
          }
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deletingSheet)}
        title={t('hr.empty.deleteOvertimeSheetTitle')}
        description={t('hr.empty.deleteOvertimeSheetDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteSheet()}
        onCancel={() => setDeletingSheet(null)}
      />

      <SectionPageHeader
        title={pageTitle}
        description={pageDescription}
      />

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
            icon={<ClockCircleOutlined />}
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
            placeholder={t('hr.placeholder.searchSheet')}
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
          <Select
            allowClear
            placeholder={t('hr.placeholder.month')}
            className="w-full min-w-0 sm:w-36"
            options={monthOptions}
            value={month}
            onChange={(value: number | undefined) => {
              setMonth(value);
              resetPage();
            }}
          />
          <Select
            allowClear
            placeholder={t('hr.placeholder.year')}
            className="w-full min-w-0 sm:w-28"
            options={yearOptions.map((y) => ({ value: y, label: String(y) }))}
            value={year}
            onChange={(value: number | undefined) => {
              setYear(value);
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
            <ClockCircleOutlined style={{ color: tokens.colorPrimary }} />
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
              {meta.total === 1
                ? t('pages.hr.overtime.sheetCountOne')
                : t('pages.hr.overtime.sheetCount', { count: meta.total })}
            </span>
          </div>
          {canCreate ? (
            <Space wrap size={8}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push('/approvals/new/overtime')}
                style={{ borderRadius: 0 }}
              >
                {t('hr.buttons.thisMonthSheet')}
              </Button>
            </Space>
          ) : null}
        </div>

        <div className="px-0">
          <DataTable<OvertimeSheetListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/overtime/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ClockCircleOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.overtime.emptyFiltered')
                      : t('hr.empty.noOvertimeSheets')
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
                            label: t('hr.buttons.thisMonthSheet'),
                            onClick: () => router.push('/approvals/new/overtime'),
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
}
