'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Input,
  Select,
  Space,
  Spin,
  Tabs,
  Tooltip,
} from 'antd';
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListPageNavIcon from '@/components/ui/ListPageNavIcon/ListPageNavIcon';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useAuthStore } from '@/stores/auth.store';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ApprovalRequestListItem,
  ApprovalRequestStatus,
  ApprovalTier,
} from '@/lib/api/approvals.types';
import {
  useApprovalCategories,
  useApprovalRequests,
  usePendingMyActionCount,
} from '@/lib/query/approvals';
import { useCurrentUser } from '@/lib/query/profile';
import { tokens } from '@/lib/theme/tokens';
import {
  findCurrentTier,
  formatApprovalUserName,
  resolveDisplayStatus,
} from '@/lib/utils/approval-display';
import { formatProjectDate } from '@/lib/utils/project-display';

type InboxTab = 'PENDING_MY_ACTION' | 'MY_REQUESTS' | 'ALL';
type StatusMode = 'all' | 'pending' | 'approved' | 'rejected';

const PENDING_STATUSES: ApprovalRequestStatus[] = [
  'PENDING',
  'IN_REVIEW',
  'SUBMITTED',
  'RETURNED',
  'DRAFT',
];
const APPROVED_STATUSES: ApprovalRequestStatus[] = ['APPROVED'];
const REJECTED_STATUSES: ApprovalRequestStatus[] = ['REJECTED', 'CANCELLED'];

function statusesForMode(mode: StatusMode): ApprovalRequestStatus[] {
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
 * Approval inbox — layout aligned with Users and Leave list pages.
 */
export default function ApprovalsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();
  const isFullAccess = useCanViewHr();
  const currentUser = useCurrentUser();
  const currentUserId = currentUser.data?.id ?? '';
  const { params, resetPage, bindMeta } = useTablePagination();
  const [inbox, setInbox] = useState<InboxTab>(() =>
    resolveDefaultInbox(useAuthStore.getState().capabilities.canViewHr),
  );
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusMode, setStatusMode] = useState<StatusMode>('all');
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

  const statusFilter = useMemo(
    () => statusesForMode(statusMode),
    [statusMode],
  );

  const categoriesQuery = useApprovalCategories();
  const listParams = useMemo(
    () => ({
      ...params,
      inbox,
      search: appliedSearch.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      categoryId,
      dateFrom: dateRange?.[0]?.startOf('day').toISOString(),
      dateTo: dateRange?.[1]?.endOf('day').toISOString(),
    }),
    [params, inbox, appliedSearch, statusFilter, categoryId, dateRange],
  );

  const listQuery = useApprovalRequests(listParams);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const countBase = useMemo(
    () => ({
      page: 1,
      limit: 1,
      inbox,
      search: appliedSearch.trim() || undefined,
      categoryId,
      dateFrom: dateRange?.[0]?.startOf('day').toISOString(),
      dateTo: dateRange?.[1]?.endOf('day').toISOString(),
    }),
    [inbox, appliedSearch, categoryId, dateRange],
  );

  const allCountQuery = useApprovalRequests(countBase);
  const pendingCountQuery = useApprovalRequests({
    ...countBase,
    status: PENDING_STATUSES,
  });
  const approvedCountQuery = useApprovalRequests({
    ...countBase,
    status: APPROVED_STATUSES,
  });
  const rejectedCountQuery = useApprovalRequests({
    ...countBase,
    status: REJECTED_STATUSES,
  });

  const statusCounts = {
    all: allCountQuery.data?.meta.total ?? 0,
    pending: pendingCountQuery.data?.meta.total ?? 0,
    approved: approvedCountQuery.data?.meta.total ?? 0,
    rejected: rejectedCountQuery.data?.meta.total ?? 0,
  };

  const pendingActionBadgeQuery = usePendingMyActionCount(
    currentUserId,
    Boolean(currentUserId),
  );
  const pendingActionCount = pendingActionBadgeQuery.data ?? 0;

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categoriesQuery.data],
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

  function handleStatusMode(mode: StatusMode): void {
    setStatusMode(mode);
    resetPage();
  }

  const pageTitle = t('pages.approvals.listTitle');
  const pageDescription = isFullAccess
    ? t('pages.approvals.listDescriptionAdmin')
    : t('pages.approvals.listDescription');

  const columns: ColumnsType<ApprovalRequestListItem> = [
    {
      title: t('pages.approvals.table.requestNumber'),
      dataIndex: 'requestNumber',
      key: 'requestNumber',
      width: 140,
      render: (value: string) => (
        <span style={{ fontWeight: 600, color: tokens.colorTextPrimary }}>
          {value}
        </span>
      ),
    },
    {
      title: t('pages.approvals.table.title'),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: t('pages.approvals.table.category'),
      key: 'category',
      width: 180,
      responsive: ['md'],
      render: (_, row) => row.category?.name ?? '—',
    },
    {
      title: t('pages.approvals.table.submittedBy'),
      key: 'requester',
      width: 160,
      responsive: ['md'],
      render: (_, row) => formatApprovalUserName(row.requester),
    },
    {
      title: t('pages.approvals.table.submitted'),
      key: 'submittedAt',
      width: 120,
      responsive: ['lg'],
      render: (_, row) =>
        formatProjectDate(row.submittedAt ?? row.createdAt ?? null),
    },
    {
      title: t('pages.approvals.table.status'),
      key: 'status',
      width: 160,
      render: (_, row) => {
        const current = findCurrentTier(
          row.tiers as ApprovalTier[] | undefined,
          row.currentTier,
        );
        const display = resolveDisplayStatus(row.status, current, t);
        return <StatusBadge label={display.label} variant={display.variant} />;
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
      responsive: ['lg'],
      render: (_, row) => {
        const current = findCurrentTier(
          row.tiers as ApprovalTier[] | undefined,
          row.currentTier,
        );
        return current?.label ?? '—';
      },
    },
  ];

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  if (listQuery.isError) {
    const message =
      listQuery.error instanceof ApiRequestError
        ? listQuery.error.message
        : t('pages.approvals.failedToLoad');
    return (
      <div className="flex flex-col gap-4">
        <Alert type="error" showIcon title={message} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
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
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ background: tokens.colorRed400 }}
                  >
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
        className="erp-list-tabs"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          className="m-0 w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={() => handleStatusMode('all')}
        >
          <StatCard
            label={t('pages.approvals.stats.total')}
            value={statusCounts.all}
            color="blue"
            icon={<AuditOutlined />}
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
            color="red"
            icon={<CloseCircleOutlined />}
          />
        </button>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('pages.approvals.searchPlaceholder')}
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
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('pages.approvals.filterCategory')}
            className="w-full min-w-0 sm:min-w-[200px] sm:w-auto"
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
            onChange={(value) => {
              setDateRange(value);
              resetPage();
            }}
            className="w-full min-w-0 sm:min-w-[260px] sm:w-auto"
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
            <ListPageNavIcon iconKey="approvals" />
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
              {meta?.total === 1
                ? t('pages.approvals.requestCountOne')
                : t('pages.approvals.requestCount', {
                    count: meta?.total ?? 0,
                  })}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/approvals/new')}
              style={{ borderRadius: 0 }}
            >
              {t('pages.approvals.newRequest')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<ApprovalRequestListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.data}
            pagination={bindMeta(meta)}
            scroll={false}
            onRow={(record) => ({
              onClick: () => router.push(`/approvals/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
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
                          onClick: () => router.push('/approvals/new'),
                        }
                  }
                />
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}
