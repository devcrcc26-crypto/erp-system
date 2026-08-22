'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dropdown,
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
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type { ExpenseClaimListItem } from '@/lib/api/expense-claim.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useDeleteExpenseClaim,
  useExpenseClaimsAll,
} from '@/lib/query/expense-claim';
import { useCurrentUser } from '@/lib/query/profile';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
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
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

function isEditableClaimStatus(status: ExpenseClaimListItem['status']): boolean {
  return status === 'DRAFT' || status === 'RETURNED';
}

const PENDING_STATUSES = statusesForExpenseClaimMode('pending');
const APPROVED_STATUSES = statusesForExpenseClaimMode('approved');
const REJECTED_STATUSES = statusesForExpenseClaimMode('rejected');

/**
 * Company or personal expense claim list — layout aligned with Users page.
 */
export default function ExpenseClaimsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const canManage = canViewHr;
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id;
  const deleteMutation = useDeleteExpenseClaim();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<ExpenseClaimStatusMode>('all');
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [deletingClaim, setDeletingClaim] =
    useState<ExpenseClaimListItem | null>(null);

  useSetHeaderExtra(null);

  const listQuery = useExpenseClaimsAll({}, true);

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
      filterExpenseClaims(allRows, {
        search: appliedSearch,
        statusMode,
        employeeId: canViewHr ? employeeId : undefined,
      }),
    [allRows, appliedSearch, statusMode, employeeId, canViewHr],
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
    ? t('pages.hr.expenseClaim.listTitle')
    : t('pages.hr.expenseClaim.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.expenseClaim.listDescription')
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
        width: 120,
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
              render: (_: unknown, row: ExpenseClaimListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatExpenseClaimEmployeeName(row.employee)}
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
            } satisfies ColumnsType<ExpenseClaimListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.title'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (value: string) => (
          <span className="text-sm" style={{ color: tokens.colorTextPrimary }}>
            {value}
          </span>
        ),
      },
      {
        title: t('hr.table.items'),
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 80,
        align: 'right',
        responsive: ['md'],
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalAmountEtb',
        key: 'totalAmountEtb',
        width: 140,
        align: 'right',
        render: (value: number | string) => (
          <span className="text-sm font-medium">{formatEtbAmount(value)}</span>
        ),
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
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
        responsive: ['lg'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        render: (_: unknown, row: ExpenseClaimListItem) => {
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
    [canManage, currentUserId, router, t],
  );

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
              : t('hr.messages.failedToLoadExpenseClaims')
          }
        />
      ) : null}

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

      <div>
        <h1
          className="m-0 text-xl font-semibold tracking-tight"
          style={{
            color: tokens.colorTextPrimary,
            fontFamily: tokens.fontFamily,
          }}
        >
          {pageTitle}
        </h1>
        <p
          className="mb-0 mt-1 text-sm"
          style={{ color: tokens.colorTextSecondary }}
        >
          {pageDescription}
        </p>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label={t('pages.approvals.stats.total')}
            value={statusCounts.all}
            color="blue"
            icon={<DollarOutlined />}
          />
        </button>
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('pending')}
        >
          <StatCard
            label={t('pages.approvals.stats.pending')}
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
            label={t('pages.approvals.stats.approved')}
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
            label={t('pages.approvals.stats.rejected')}
            value={statusCounts.rejected}
            color="default"
            icon={<CloseCircleOutlined />}
          />
        </button>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('pages.hr.expenseClaim.searchPlaceholder')}
            className="w-full min-w-0 sm:w-72"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            <DollarOutlined style={{ color: tokens.colorPrimary }} />
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
                ? t('pages.hr.expenseClaim.claimCountOne')
                : t('pages.hr.expenseClaim.claimCount', { count: meta.total })}
            </span>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/expense-claim')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.newExpenseClaim')}
          </Button>
        </div>

        <div className="px-0">
          <DataTable<ExpenseClaimListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/hr/expense-claims/${record.id}`),
              style: { cursor: 'pointer' },
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
            pagination={bindMeta(meta)}
          />
        </div>
      </div>
    </div>
  );
}
