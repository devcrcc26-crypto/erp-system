'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Select,
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
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import {
  useCanAccessOvertime,
  useCanCreateOvertime,
  useCanViewHr,
  useCanViewTeam,
} from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { OvertimeSheetListItem } from '@/lib/api/overtime.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  downloadOvertimeImportTemplate,
  fetchOvertimeSheetDetails,
  useDeleteOvertimeSheet,
  useOvertimeImport,
  useOvertimeImportPreview,
  useOvertimeSheetsAll,
} from '@/lib/query/overtime';
import { useCurrentUser } from '@/lib/query/profile';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatOvertimeEmployeeName,
  formatOvertimeHours,
  formatOvertimePeriod,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';

function renderHoursCell(
  value: number,
  options?: { emphasize?: boolean },
): React.ReactNode {
  const amount = Number(value);
  if (!(amount > 0)) {
    return (
      <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>
    );
  }
  const label = `${formatOvertimeHours(amount)}h`;
  if (options?.emphasize) {
    return (
      <span style={{ fontWeight: 600, color: 'var(--color-teal-600)' }}>
        {label}
      </span>
    );
  }
  return <span style={{ fontWeight: 500 }}>{label}</span>;
}
import {
  filterOvertimeSheets,
  statusesForOvertimeMode,
  type OvertimeStatusMode,
} from '@/lib/utils/overtime-list-filter';
import {
} from '@/lib/utils/overtime-export-excel';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildOvertimeExportSheets } from '@/lib/utils/overtime-export';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
function isEditableSheetStatus(status: OvertimeSheetListItem['status']): boolean {
  return (
    status === 'DRAFT' ||
    status === 'RETURNED' ||
    status === 'SUBMITTED' ||
    status === 'IN_REVIEW' ||
    status === 'APPROVED'
  );
}

const PENDING_STATUSES = statusesForOvertimeMode('pending');
const APPROVED_STATUSES = statusesForOvertimeMode('approved');
const REJECTED_STATUSES = statusesForOvertimeMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

function OvertimeStat({
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
 * Overtime sheets list - Users chrome (stat bar, filter row, rounded table).
 */
export default function OvertimeSheetsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;

  const canAccess = useCanAccessOvertime();
  const canViewHr = useCanViewHr();
  const canViewTeam = useCanViewTeam();
  const canManage = canViewHr;
  const canCreate = useCanCreateOvertime();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id;
  const deleteMutation = useDeleteOvertimeSheet();
  const importPreview = useOvertimeImportPreview();
  const importCommit = useOvertimeImport();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<OvertimeStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [year, setYear] = useState<number | undefined>();
  const [deletingSheet, setDeletingSheet] =
    useState<OvertimeSheetListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

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
        employeeId: canViewTeam ? employeeId : undefined,
        month,
        year,
      }),
    [allRows, appliedSearch, statusMode, employeeId, month, year, canViewTeam],
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
    ? t('pages.hr.overtime.listTitle')
    : t('pages.hr.overtime.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.overtime.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
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
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      ...(canViewTeam
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              width: 220,
              responsive: ['md'],
              render: (_: unknown, row: OvertimeSheetListItem) => (
                <div className="min-w-0">
                  <p className="erp-users-cell-strong m-0">
                    {formatOvertimeEmployeeName(row.employee)}
                  </p>
                  {row.employee?.email ? (
                    <p className="erp-users-email m-0 mt-0.5">
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
        render: (_: unknown, row: OvertimeSheetListItem) => (
          <span className="erp-users-cell-sub">
            {formatOvertimePeriod(row.month, row.year, t)}
          </span>
        ),
      },
      {
        title: t('hr.table.regularHours'),
        dataIndex: 'totalRegularHours',
        key: 'totalRegularHours',
        width: 120,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => renderHoursCell(value),
      },
      {
        title: t('hr.table.nightHours'),
        dataIndex: 'totalNightHours',
        key: 'totalNightHours',
        width: 120,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => renderHoursCell(value),
      },
      {
        title: t('hr.table.weekendHours'),
        dataIndex: 'totalWeekendHours',
        key: 'totalWeekendHours',
        width: 120,
        align: 'right',
        responsive: ['xl'],
        render: (value: number) => renderHoursCell(value),
      },
      {
        title: t('hr.table.holidayHours'),
        dataIndex: 'totalHolidayHours',
        key: 'totalHolidayHours',
        width: 120,
        align: 'right',
        responsive: ['xl'],
        render: (value: number) => renderHoursCell(value),
      },
      {
        title: t('hr.table.totalHours'),
        dataIndex: 'totalHours',
        key: 'totalHours',
        width: 100,
        align: 'right',
        render: (value: number) => renderHoursCell(value, { emphasize: true }),
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
              className="erp-table-row-actions flex items-center justify-end"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Dropdown menu={{ items }} trigger={['click']} rootClassName="erp-row-actions-menu">
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
      },
    ],
    [canManage, canViewHr, canViewTeam, currentUserId, router, t],
  );

  if (!canAccess) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-overtime-page ${LIST_PAGE_V2}`}>
        <Alert type="warning" showIcon title={t('pages.hr.accessDenied')} />
      </div>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-overtime-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-overtime-page ${LIST_PAGE_V2}`}>
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

      {importOpen ? (
        <HrImportModal
          entity="overtimeSheets"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadOvertimeImportTemplate}
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
              : t('hr.messages.failedToLoadOvertimeSheets')
          }
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <OvertimeStat
          label={t('pages.hr.overtime.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <OvertimeStat
          label={t('pages.hr.overtime.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <OvertimeStat
          label={t('pages.hr.overtime.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <OvertimeStat
          label={t('pages.hr.overtime.stats.rejected')}
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
                  key: 'export-sheets',
                  label: t('pages.hr.overtime.exportSheets'),
                  filePrefix: 'overtime-sheets',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildOvertimeExportSheets(filtered),
                },
                {
                  key: 'export-entries',
                  label: t('pages.hr.overtime.exportEntries'),
                  filePrefix: 'overtime-sheets-with-entries',
                  disabled: filtered.length === 0,
                  buildSheets: async () =>
                    buildOvertimeExportSheets(
                      filtered,
                      await fetchOvertimeSheetDetails(
                        filtered.map((row) => row.id),
                      ),
                    ),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                canCreate
                  ? {
                      label: t('hr.buttons.thisMonthSheet'),
                      onClick: () => router.push('/approvals/new/overtime'),
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
            placeholder={t('hr.placeholder.searchSheet')}
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
          <Select
            allowClear
            placeholder={t('hr.placeholder.month')}
            className="erp-users-filter-select"
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
            className="erp-users-filter-select"
            options={yearOptions.map((y) => ({ value: y, label: String(y) }))}
            value={year}
            onChange={(value: number | undefined) => {
              setYear(value);
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
          <DataTable<OvertimeSheetListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            scroll={{ x: isCompact ? 720 : 1100 }}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/overtime/${record.id}`),
              className: 'cursor-pointer',
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
                            onClick: () =>
                              router.push('/approvals/new/overtime'),
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
