'use client';

import './approvals-v2.css';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Grid,
  Input,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FormOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
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
  formatApprovedOnBehalf,
  formatApprovalUserName,
  formatSubmittedFor,
  resolveDisplayStatus,
} from '@/lib/utils/approval-display';
import { formatApprovalCategoryName } from '@/lib/utils/approval-category-display';
import {
  filterApprovalRequests,
  hideCancelledFromApprovers,
  statusesForApprovalMode,
  type ApprovalStatusMode,
} from '@/lib/utils/approvals-list-filter';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  EDITABLE_REQUEST_CATEGORIES,
  canEditOwnRequest,
} from '@/lib/utils/request-edit';
import type { DraftModule } from '@/lib/api/drafts.types';
import { useMyDrafts } from '@/lib/query/drafts';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
import { DraftsPanel } from './DraftsPanel';

type InboxTab = 'PENDING_MY_ACTION' | 'MY_REQUESTS' | 'ALL' | 'MY_DRAFTS';

type ApprovalInbox = 'PENDING_MY_ACTION' | 'MY_REQUESTS' | 'ALL';

function toApprovalInbox(tab: InboxTab): ApprovalInbox {
  if (tab === 'MY_DRAFTS') {
    return 'MY_REQUESTS';
  }
  return tab;
}

const PAGE_ROOT = `erp-pro-list-page erp-users-page erp-approvals-page erp-approvals-v2 ${LIST_PAGE_V2}`;

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
 * Approval inbox - Users chrome with client-side search/filters.
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
  const [draftModule, setDraftModule] = useState<DraftModule | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const isDraftsInbox = inbox === 'MY_DRAFTS';
  const draftsQuery = useMyDrafts(isDraftsInbox, draftModule);

  useSetHeaderExtra(null);

  useEffect(() => {
    if (inbox === 'ALL' && !isFullAccess) {
      setInbox('MY_REQUESTS');
    }
  }, [inbox, isFullAccess]);

  const categoriesQuery = useApprovalCategories();
  const listQuery = useApprovalRequestsAll(
    { inbox: toApprovalInbox(inbox) },
    !isDraftsInbox,
  );
  const allRows = useMemo(
    () =>
      isDraftsInbox
        ? []
        : hideCancelledFromApprovers(listQuery.data ?? [], {
            inbox: toApprovalInbox(inbox),
            currentUserId,
            isFullAccess,
          }),
    [currentUserId, inbox, isDraftsInbox, isFullAccess, listQuery.data],
  );

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
            ) || '-'}
          </span>
        ),
      },
      {
        title: t('pages.approvals.table.submittedBy'),
        key: 'requester',
        width: 160,
        responsive: ['md'],
        render: (_: unknown, row: ApprovalRequestListItem) => {
          const submittedFor = formatSubmittedFor(row, t);
          return (
            <div className="min-w-0">
              <span className="erp-users-cell-strong">
                {formatApprovalUserName(row.requester)}
              </span>
              {submittedFor ? (
                <p className="erp-users-cell-sub m-0">{submittedFor}</p>
              ) : null}
            </div>
          );
        },
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
          const onBehalf = [...(row.tiers ?? [])]
            .reverse()
            .map((tier) => formatApprovedOnBehalf(tier, t))
            .find(Boolean);
          return (
            <div className="min-w-0">
              {current?.label ? (
                <span className="erp-users-role-tag">{current.label}</span>
              ) : (
                <span className="erp-users-cell-sub">-</span>
              )}
              {onBehalf ? (
                <p className="erp-users-cell-sub m-0">{onBehalf}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        title: (
          <span className="sr-only">{t('pages.approvals.edit.button')}</span>
        ),
        key: 'edit',
        width: isNarrow ? 56 : 96,
        align: 'right',
        render: (_: unknown, row: ApprovalRequestListItem) => {
          const code = row.categoryCode ?? row.category?.code ?? '';
          if (
            !EDITABLE_REQUEST_CATEGORIES.has(code) ||
            !canEditOwnRequest(row.status, row.requestedBy, currentUserId)
          ) {
            return null;
          }
          return (
            <Button
              size="small"
              icon={<EditOutlined />}
              aria-label={t('pages.approvals.edit.buttonAria', {
                number: row.requestNumber,
              })}
              onClick={(event) => {
                // Row click opens the detail page.
                event.stopPropagation();
                router.push(`${LIST_PATH}/${row.id}/edit`);
              }}
            >
              {isNarrow ? undefined : t('pages.approvals.edit.button')}
            </Button>
          );
        },
      },
    ],
    [currentUserId, inbox, isNarrow, router, t],
  );

  if (!isDraftsInbox && listQuery.isLoading && !listQuery.data) {
    return (
      <div className={PAGE_ROOT}>
        <div className="erp-pro-card flex justify-center p-12">
          <Spin />
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_ROOT}>
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

      <div className="erp-pro-card">
        <div className="erp-approvals-tabbar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={inbox === 'MY_REQUESTS'}
            onClick={() => {
              setInbox('MY_REQUESTS');
              resetPage();
            }}
          >
            <UserOutlined aria-hidden />
            <span>{t('pages.approvals.tabs.myRequests')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inbox === 'PENDING_MY_ACTION'}
            onClick={() => {
              setInbox('PENDING_MY_ACTION');
              resetPage();
            }}
          >
            <ClockCircleOutlined aria-hidden />
            <span>{t('pages.approvals.tabs.pendingMyAction')}</span>
            {pendingActionCount > 0 ? (
              <span className="erp-approvals-tab-badge">
                {pendingActionCount > 99 ? '99+' : pendingActionCount}
              </span>
            ) : null}
          </button>
          {isFullAccess ? (
            <button
              type="button"
              role="tab"
              aria-selected={inbox === 'ALL'}
              onClick={() => {
                setInbox('ALL');
                resetPage();
              }}
            >
              <TeamOutlined aria-hidden />
              <span>{t('pages.approvals.tabs.allRequests')}</span>
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={inbox === 'MY_DRAFTS'}
            onClick={() => {
              setInbox('MY_DRAFTS');
              resetPage();
            }}
          >
            <FormOutlined aria-hidden />
            <span>{t('pages.approvals.tabs.myDrafts')}</span>
          </button>
        </div>
      </div>

      {isDraftsInbox ? (
        <>
          {draftsQuery.isError ? (
            <ErpNotice
              tone="error"
              className="mb-4"
              title={getFriendlyApiErrorMessage(
                draftsQuery.error,
                t('pages.approvals.failedToLoad'),
                t,
              )}
            />
          ) : null}
          <DraftsPanel
            items={draftsQuery.data ?? []}
            isLoading={draftsQuery.isLoading}
            isFetching={draftsQuery.isFetching}
            module={draftModule}
            onModuleChange={setDraftModule}
            onRefresh={() => void draftsQuery.refetch()}
            onNewRequest={() => router.push(NEW_PATH)}
            pageDescription={pageDescription}
          />
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
