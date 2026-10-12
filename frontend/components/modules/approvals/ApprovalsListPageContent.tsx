'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Select,
  Spin,
  Tabs,
  Tooltip,
} from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useTablePagination } from '@/hooks/use-table-pagination';
import type {
  ApprovalRequestListItem,
  ApprovalTier,
} from '@/lib/api/approvals.types';
import type { PaginationMeta } from '@/lib/api/types';
import {
  useApprovalCategories,
  useApprovalRequestsAll,
  usePendingMyActionCount,
} from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';
import {
  findCurrentTier,
  formatApprovalUserName,
  resolveDisplayStatus,
} from '@/lib/utils/approval-display';
import { formatApprovalCategoryName } from '@/lib/utils/approval-category-display';
import {
  filterApprovalRequests,
  statusesForApprovalMode,
  type ApprovalStatusMode,
} from '@/lib/utils/approvals-list-filter';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
type InboxTab = 'PENDING_MY_ACTION' | 'MY_REQUESTS' | 'ALL';

const NEW_PATH = '/approvals/new';
const LIST_PATH = '/approvals';

const PENDING_STATUSES = statusesForApprovalMode('pending');
const APPROVED_STATUSES = statusesForApprovalMode('approved');
const REJECTED_STATUSES = statusesForApprovalMode('rejected');

const STAT_ACCENT = {
  teal: { bg: '#E1F5EE', fg: '#1D9E75' },
  green: { bg: '#EAF3DE', fg: '#639922' },
  amber: { bg: '#FAEEDA', fg: '#BA7517' },
  red: { bg: '#FCEBEB', fg: '#D32F2F' },
} as const;

function ApprovalsStat({
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

function getActionNeeded(
  request: ApprovalRequestListItem,
  currentUserId: string,
): string {
  if (request.needsTicketAcknowledgement) {
    return 'Acknowledge Ticket';
  }

  if (request.requestedBy === currentUserId) {
    if (request.status === 'RETURNED') {
      return 'Resubmit Required';
    }
    const current = findCurrentTier(
      request.tiers as ApprovalTier[] | undefined,
      request.currentTier,
    );
    if (current?.decision === 'CONDITIONALLY_APPROVED') {
      return 'Response Required';
    }
  }
  return 'Approval Required';
}

function resolveDefaultInbox(canViewHr: boolean): InboxTab {
  return canViewHr ? 'ALL' : 'MY_REQUESTS';
}

/**
 * Approval inbox — Users chrome with client-side search/filters.
 */
export default function ApprovalsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
  const isFullAccess = useCanViewHr();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';
  const { params, resetPage, bindMeta } = useTablePagination(10);
  const [inbox, setInbox] = useState<InboxTab>(() =>
    resolveDefaultInbox(useAuthStore.getState().capabilities.canViewHr),
  );
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<ApprovalStatusMode>('all');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  useSetHeaderExtra(null);

  useEffect(() => {
    if (inbox === 'ALL' && !isFullAccess) {
      setInbox('MY_REQUESTS');
    }
  }, [inbox, isFullAccess]);

  const categoriesQuery = useApprovalCategories();
  const listQuery = useApprovalRequestsAll({ inbox }, true);
  const allRows = listQuery.data ?? [];

  const statusCounts = useMemo(() => {
    const scoped = filterApprovalRequests(allRows, {
      search: appliedSearch,
      categoryId,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    });
    return {
      all: scoped.length,
      pending: scoped.filter((row) => PENDING_STATUSES.includes(row.status))
        .length,
      approved: scoped.filter((row) => APPROVED_STATUSES.includes(row.status))
        .length,
      rejected: scoped.filter((row) => REJECTED_STATUSES.includes(row.status))
        .length,
    };
  }, [allRows, appliedSearch, categoryId, dateRange]);

  const filtered = useMemo(
    () =>
      filterApprovalRequests(allRows, {
        search: appliedSearch,
        statusMode,
        categoryId,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }),
    [allRows, appliedSearch, statusMode, categoryId, dateRange],
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

  const pendingActionBadgeQuery = usePendingMyActionCount(
    currentUserId,
    Boolean(currentUserId),
  );
  const pendingActionCount = pendingActionBadgeQuery.data ?? 0;

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((category) => ({
        value: category.id,
        label: formatApprovalCategoryName(category.code, t, category.name),
      })),
    [categoriesQuery.data, t],
  );

  const hasFilters =
    Boolean(appliedSearch.trim()) ||
    statusMode !== 'all' ||
    Boolean(categoryId) ||
    Boolean(dateRange?.[0]) ||
    Boolean(dateRange?.[1]);

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusMode('all');
    setCategoryId(undefined);
    setDateRange(null);
    resetPage();
  }

  function handleStatusMode(mode: ApprovalStatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const pageDescription = isFullAccess
    ? t('pages.approvals.listDescriptionAdmin')
    : t('pages.approvals.listDescription');

  const columns: ColumnsType<ApprovalRequestListItem> = useMemo(
    () => [
      {
        title: t('pages.approvals.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 140,
        responsive: ['md'],
        render: (value: string) => (
          <span className="erp-users-id-chip">{value}</span>
        ),
      },
      {
        title: t('pages.approvals.table.title'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
        render: (value: string, row: ApprovalRequestListItem) => (
          <div className="min-w-0">
            <p className="erp-users-cell-strong m-0 truncate">{value}</p>
            {row.lateSubmission?.isLate ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate text-[#BA7517]">
                {t('pages.approvals.lateSubmissionBadge', {
                  month: row.lateSubmission.monthLabel,
                })}
              </p>
            ) : null}
            {isNarrow ? (
              <p className="erp-users-cell-sub m-0 mt-0.5 truncate">
                {row.requestNumber}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('pages.approvals.table.category'),
        key: 'category',
        width: 180,
        responsive: ['md'],
        render: (_: unknown, row: ApprovalRequestListItem) => (
          <span className="erp-users-cell-sub">
            {formatApprovalCategoryName(
              row.category?.code ?? row.categoryCode,
              t,
              row.category?.name,
            ) || '—'}
          </span>
        ),
      },
      {
        title: t('pages.approvals.table.submittedBy'),
        key: 'requester',
        width: 160,
        responsive: ['md'],
        render: (_: unknown, row: ApprovalRequestListItem) => (
          <span className="erp-users-cell-strong">
            {formatApprovalUserName(row.requester)}
          </span>
        ),
      },
      {
        title: t('pages.approvals.table.submitted'),
        key: 'submittedAt',
        width: 120,
        responsive: ['lg'],
        render: (_: unknown, row: ApprovalRequestListItem) => (
          <span className="erp-users-cell-sub">
            {formatProjectDate(row.submittedAt ?? row.createdAt ?? null)}
          </span>
        ),
      },
      {
        title: t('pages.approvals.table.status'),
        key: 'status',
        width: isNarrow ? 110 : 160,
        render: (_: unknown, row: ApprovalRequestListItem) => {
          const current = findCurrentTier(
            row.tiers as ApprovalTier[] | undefined,
            row.currentTier,
          );
          const display = resolveDisplayStatus(row.status, current, t);
          return (
            <StatusBadge label={display.label} variant={display.variant} />
          );
        },
      },
      ...(inbox === 'PENDING_MY_ACTION'
        ? [
            {
              title: t('pages.approvals.table.actionNeeded'),
              key: 'actionNeeded',
              width: 160,
              render: (_: unknown, row: ApprovalRequestListItem) => (
                <StatusBadge
                  label={getActionNeeded(row, currentUserId)}
                  variant="warning"
                />
              ),
            } satisfies ColumnsType<ApprovalRequestListItem>[number],
          ]
        : []),
      {
        title: t('pages.approvals.table.currentTier'),
        key: 'currentTier',
        width: 160,
        ellipsis: true,
        responsive: ['lg'],
        render: (_: unknown, row: ApprovalRequestListItem) => {
          const current = findCurrentTier(
            row.tiers as ApprovalTier[] | undefined,
            row.currentTier,
          );
          return current?.label ? (
            <span className="erp-users-role-tag">{current.label}</span>
          ) : (
            <span className="erp-users-cell-sub">—</span>
          );
        },
      },
    ],
    [currentUserId, inbox, isNarrow, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-approvals-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-approvals-page ${LIST_PAGE_V2}`}>
      {listQuery.isError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={getFriendlyApiErrorMessage(
            listQuery.error,
            t('pages.approvals.failedToLoad'),
            t,
          )}
        />
      ) : null}

      <Tabs
        activeKey={inbox}
        onChange={(key) => {
          setInbox(key as InboxTab);
          resetPage();
        }}
        items={[
          {
            key: 'MY_REQUESTS',
            label: t('pages.approvals.tabs.myRequests'),
          },
          {
            key: 'PENDING_MY_ACTION',
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t('pages.approvals.tabs.pendingMyAction')}
                {pendingActionCount > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D32F2F] px-1 text-[10px] font-bold text-white">
                    {pendingActionCount > 99 ? '99+' : pendingActionCount}
                  </span>
                ) : null}
              </span>
            ),
          },
          ...(isFullAccess
            ? [
                {
                  key: 'ALL' as const,
                  label: t('pages.approvals.tabs.allRequests'),
                },
              ]
            : []),
        ]}
        className="erp-list-tabs mb-3"
      />

      <div className="erp-users-stat-bar">
        <ApprovalsStat
          label={t('pages.approvals.stats.total')}
          value={statusCounts.all}
          accent="teal"
          icon={<InboxOutlined />}
          active={statusMode === 'all'}
          onClick={() => handleStatusMode('all')}
        />
        <ApprovalsStat
          label={t('pages.approvals.stats.pending')}
          value={statusCounts.pending}
          accent="amber"
          icon={<ClockCircleOutlined />}
          active={statusMode === 'pending'}
          onClick={() => handleStatusMode('pending')}
        />
        <ApprovalsStat
          label={t('pages.approvals.stats.approved')}
          value={statusCounts.approved}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusMode === 'approved'}
          onClick={() => handleStatusMode('approved')}
        />
        <ApprovalsStat
          label={t('pages.approvals.stats.rejected')}
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
            <h3 className="erp-pro-card-toolbar-title">
              {t('pages.approvals.listTitle')}
            </h3>
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push(NEW_PATH)}
              aria-label={t('pages.approvals.newRequest')}
            >
              {isNarrow ? undefined : t('pages.approvals.newRequest')}
            </Button>
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('pages.approvals.searchPlaceholder')}
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
            showSearch
            optionFilterProp="label"
            placeholder={t('pages.approvals.filterCategory')}
            className="erp-users-filter-select"
            options={categoryOptions}
            value={categoryId}
            loading={categoriesQuery.isLoading}
            onChange={(value: string | undefined) => {
              setCategoryId(value);
              resetPage();
            }}
          />
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
          <DataTable<ApprovalRequestListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && rows.length === 0}
            scroll={{ x: isNarrow ? 560 : isCompact ? 860 : 1100 }}
            onRow={(record) => ({
              onClick: () => router.push(`${LIST_PATH}/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<AuditOutlined />}
                  title={
                    hasFilters
                      ? t('pages.approvals.emptyFiltered')
                      : t('pages.approvals.empty')
                  }
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('pages.approvals.newRequest'),
                          onClick: () => router.push(NEW_PATH),
                        }
                  }
                />
              ),
            }}
            pagination={{
              ...bindMeta(meta),
              pageSizeOptions: ['10', '20', '50', '100'],
              simple: isNarrow,
              showSizeChanger: !isNarrow,
            }}
          />
        </div>
      </div>
    </div>
  );
}
