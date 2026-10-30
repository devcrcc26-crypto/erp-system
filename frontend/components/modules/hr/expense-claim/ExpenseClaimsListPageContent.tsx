'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import '@/components/modules/users/employees-v2.css';

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
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import HrPersonCell from '@/components/modules/hr/shared/HrPersonCell';
import HrImportModal from '@/components/modules/hr/HrImportModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr, useCanViewTeam } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimListItem } from '@/lib/api/expense-claim.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  downloadExpenseClaimImportTemplate,
  fetchExpenseClaimDetails,
  useDeleteExpenseClaim,
  useExpenseClaimImport,
  useExpenseClaimImportPreview,
  useExpenseClaimsAll,
} from '@/lib/query/expense-claim';
import { useCurrentUser } from '@/lib/query/profile';
import { useUsersDirectory } from '@/lib/query/users';
import {
  expenseClaimStatusVariant,
  formatEtbAmount,
  formatExpenseClaimEmployeeName,
  formatExpenseClaimStatus,
} from '@/lib/utils/expense-claim-display';
import {
  filterExpenseClaims,
  statusesForExpenseClaimMode,
  type ExpenseClaimStatusMode,
} from '@/lib/utils/expense-claim-list-filter';
import {
} from '@/lib/utils/expense-claim-export-excel';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName, teamEmployeeOptions } from '@/lib/utils/user-display';
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import { buildExpenseClaimExportSheets } from '@/lib/utils/expense-claim-export';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
function isEditableClaimStatus(status: ExpenseClaimListItem['status']): boolean {
  return status === 'DRAFT' || status === 'RETURNED';
}

const DRAFT_STATUSES = statusesForExpenseClaimMode('draft');
const PENDING_STATUSES = statusesForExpenseClaimMode('pending');
const APPROVED_STATUSES = statusesForExpenseClaimMode('approved');
const REJECTED_STATUSES = statusesForExpenseClaimMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

function ExpenseClaimStat({
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
 * Expense claims list - Users chrome (stat bar, filter row, rounded table).
 */
export default function ExpenseClaimsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const canViewHr = useCanViewHr();
  const canViewTeam = useCanViewTeam();
  const canManage = canViewHr;
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id;
  const deleteMutation = useDeleteExpenseClaim();
  const importPreview = useExpenseClaimImportPreview();
  const importCommit = useExpenseClaimImport();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<ExpenseClaimStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [deletingClaim, setDeletingClaim] =
    useState<ExpenseClaimListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const listQuery = useExpenseClaimsAll({}, true);

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
      filterExpenseClaims(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewTeam ? employeeId : undefined,
      }),
    [allRows, appliedSearch, statusMode, employeeId, canViewTeam],
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
    ? t('pages.hr.expenseClaim.listTitle')
    : t('pages.hr.expenseClaim.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.expenseClaim.listDescription')
    : canViewTeam
      ? t('pages.hr.teamListDescription')
      : t('pages.hr.expenseClaim.myListDescription');

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setEmployeeId(undefined);
    resetPage();
  }

  function handleStatusMode(mode: ExpenseClaimStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }



  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(employeeId);

  function buildActionMenu(row: ExpenseClaimListItem): MenuProps['items'] {
    const isOwner = Boolean(currentUserId) && row.employeeId === currentUserId;
    const canEditRow =
      isEditableClaimStatus(row.status) && (canManage || isOwner);
    const items: MenuProps['items'] = [];
    if (canEditRow) {
      items.push({
        key: 'update',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`/hr/expense-claims/${row.id}/edit`),
      });
    }
    if (canManage) {
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeletingClaim(row),
      });
    }
    return items;
  }

  async function handleDeleteClaim(): Promise<void> {
    if (!deletingClaim) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deletingClaim.id);
      messageApi.success(t('hr.messages.expenseClaimDeleted'));
      setDeletingClaim(null);
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToDeleteExpenseClaim'),
        messageApi,
      );
    }
  }

  const columns: ColumnsType<ExpenseClaimListItem> = useMemo(
    () => [
      {
        title: t('hr.table.claimNumber'),
        dataIndex: 'claimNumber',
        key: 'claimNumber',
        width: 130,
        responsive: ['md'],
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
              render: (_: unknown, row: ExpenseClaimListItem) => (
                <HrPersonCell
                  person={row.employee}
                  name={formatExpenseClaimEmployeeName(row.employee)}
                />
              ),
            } satisfies ColumnsType<ExpenseClaimListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.title'),
        key: 'title',
        ellipsis: true,
        render: (_: unknown, row: ExpenseClaimListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{row.title}</p>
            <p className="erp-users-cell-sub m-0 mt-0.5 md:hidden">
              {row.claimNumber}
            </p>
          </div>
        ),
      },
      {
        title: t('hr.table.items'),
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 80,
        align: 'right',
        responsive: ['lg'],
        render: (value: number) => (
          <span className="erp-users-cell-sub tabular-nums">{value}</span>
        ),
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalAmountEtb',
        key: 'totalAmountEtb',
        width: isNarrow ? 110 : 140,
        align: 'right',
        render: (value: number | string) => (
          <span className="erp-users-cell-strong tabular-nums">
            {formatEtbAmount(value)}
          </span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: isNarrow ? 108 : 130,
        render: (value: ExpenseClaimListItem['status']) => (
          <StatusBadge
            label={formatExpenseClaimStatus(value, t)}
            variant={expenseClaimStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.createdDate'),
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 120,
        responsive: ['xl'],
        render: (value: string) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(value)}
          </span>
        ),
      },
      {
        title: '',
        key: 'actions',
        width: 48,
        fixed: isCompact ? ('right' as const) : undefined,
        render: (_: unknown, row: ExpenseClaimListItem) => {
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
    [canManage, canViewHr, canViewTeam, currentUserId, isCompact, isNarrow, router, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-expense-claims-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-employees-v2 erp-hr-travel-v2 erp-expense-claims-page ${LIST_PAGE_V2}`}>
      <ConfirmDialog
        open={Boolean(deletingClaim)}
        title={t('hr.empty.deleteExpenseClaimTitle')}
        description={t('hr.empty.deleteExpenseClaimDescription')}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDeleteClaim()}
        onCancel={() => setDeletingClaim(null)}
      />

      {importOpen ? (
        <HrImportModal
          entity="expenseClaims"
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            messageApi.success(summary);
            void listQuery.refetch();
          }}
          downloadTemplate={downloadExpenseClaimImportTemplate}
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
              : t('hr.messages.failedToLoadExpenseClaims')
          }
        />
      ) : null}

      <div className="erp-users-stat-bar">
        <ExpenseClaimStat
          label={t('pages.hr.expenseClaim.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<DollarOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <ExpenseClaimStat
          label={t('pages.hr.expenseClaim.stats.draft')}
          value={statusCounts.draft}
          accent="amber"
          icon={<FileTextOutlined />}
          active={statusMode === 'draft'}
          onClick={() => handleStatusMode('draft')}
        />
        <ExpenseClaimStat
          label={t('pages.hr.expenseClaim.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <ExpenseClaimStat
          label={t('pages.hr.expenseClaim.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <ExpenseClaimStat
          label={t('pages.hr.expenseClaim.stats.rejected')}
          value={statusCounts.rejected}
          accent="red"
          icon={<CloseCircleOutlined />}
          active={statusMode === 'rejected'}
          onClick={() => handleStatusMode('rejected')}
        />
      </div>

      <div className="erp-pro-card erp-employees-list-card">
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
                  key: 'export-claims',
                  label: t('pages.hr.expenseClaim.exportClaims'),
                  filePrefix: 'expense-claims',
                  disabled: filtered.length === 0,
                  buildSheets: () => buildExpenseClaimExportSheets(filtered),
                },
                {
                  key: 'export-items',
                  label: t('pages.hr.expenseClaim.exportItems'),
                  filePrefix: 'expense-claims-with-items',
                  disabled: filtered.length === 0,
                  buildSheets: async () =>
                    buildExpenseClaimExportSheets(
                      filtered,
                      await fetchExpenseClaimDetails(
                        filtered.map((row) => row.id),
                      ),
                    ),
                },
              ]}
              onImport={canViewHr ? () => setImportOpen(true) : undefined}
              primary={
                {
                  label: t('hr.buttons.newExpenseClaim'),
                  onClick: () => router.push('/approvals/new/expense-claim'),
                }
              }
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.hr.expenseClaim.searchPlaceholder')}
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
          {hasFilters ? (
            <Button type="link" onClick={handleResetFilters} className="!px-1">
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="erp-pro-table-card-body">
          <DataTable<ExpenseClaimListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 1000 }}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/expense-claims/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<DollarOutlined />}
                  title={
                    hasFilters
                      ? t('pages.hr.expenseClaim.emptyFiltered')
                      : t('hr.empty.noExpenseClaims')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newExpenseClaim'),
                          onClick: () =>
                            router.push('/approvals/new/expense-claim'),
                        }
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
