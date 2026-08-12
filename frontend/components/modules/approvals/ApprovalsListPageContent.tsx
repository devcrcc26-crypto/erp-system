'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select, Tabs } from 'antd';
import { AuditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/ui/DataTable/DataTable';
import FormLayout, {
  PageLoadingSkeleton,
} from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
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

const STATUS_FILTER_OPTIONS: Array<{
  value: ApprovalRequestStatus;
  label: string;
}> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'DRAFT', label: 'Draft' },
];

type InboxTab = 'PENDING_MY_ACTION' | 'MY_REQUESTS' | 'ALL';

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
 * Approval inbox — All Requests (default for hr.view), My Requests (default otherwise),
 * and Pending My Action. Scoping is enforced server-side via the `inbox` query param.
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
  const [statusFilter, setStatusFilter] = useState<ApprovalRequestStatus[]>([]);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  useEffect(() => {
    if (inbox === 'ALL' && !isFullAccess) {
      setInbox('MY_REQUESTS');
    }
  }, [inbox, isFullAccess]);

  const categoriesQuery = useApprovalCategories();
  const listParams = useMemo(
    () => ({
      ...params,
      inbox,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      categoryId,
      dateFrom: dateRange?.[0]?.startOf('day').toISOString(),
      dateTo: dateRange?.[1]?.endOf('day').toISOString(),
    }),
    [params, inbox, search, statusFilter, categoryId, dateRange],
  );

  const listQuery = useApprovalRequests(listParams);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const pendingCountQuery = usePendingMyActionCount(
    currentUserId,
    Boolean(currentUserId),
  );
  const pendingActionCount = pendingCountQuery.data ?? 0;

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? []).map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categoriesQuery.data],
  );

  const columns: ColumnsType<ApprovalRequestListItem> = [
    {
      title: 'Request #',
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
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Category',
      key: 'category',
      width: 180,
      render: (_, row) => row.category?.name ?? '—',
    },
    {
      title: 'Submitted by',
      key: 'requester',
      width: 160,
      render: (_, row) => formatApprovalUserName(row.requester),
    },
    {
      title: 'Submitted',
      key: 'submittedAt',
      width: 120,
      render: (_, row) =>
        formatProjectDate(row.submittedAt ?? row.createdAt ?? null),
    },
    {
      title: 'Status',
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
            title: 'Action needed',
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
      title: 'Current tier',
      key: 'currentTier',
      width: 160,
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
    return <PageLoadingSkeleton />;
  }

  if (listQuery.isError) {
    const message =
      listQuery.error instanceof ApiRequestError
        ? listQuery.error.message
        : 'Failed to load approval requests';
    return (
      <FormLayout
        title="Approvals"
        description="Browse and act on approval requests."
      >
        <Alert type="error" showIcon title={message} />
      </FormLayout>
    );
  }

  return (
    <FormLayout
      title="Approvals"
      description={
        isFullAccess
          ? 'Your actions, your submissions, and company-wide approval requests.'
          : 'Requests you submitted and items waiting for your action.'
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push('/approvals/new')}
        >
          New Request
        </Button>
      }
    >
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
        className="mb-2"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ListSearchInput
          committedValue={search}
          placeholder="Search title or request #"
          className="w-full min-w-0 sm:w-[240px]"
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
        />
        <Select
          mode="multiple"
          allowClear
          placeholder="Status"
          className="min-w-[200px]"
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={(value: ApprovalRequestStatus[]) => {
            setStatusFilter(value);
            resetPage();
          }}
          maxTagCount="responsive"
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Category"
          className="min-w-[200px]"
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
          className="min-w-[260px]"
        />
        <TableUpdatingIndicator active={listQuery.isFetching} />
      </div>

      <DataTable<ApprovalRequestListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isFetching && !listQuery.data}
        pagination={bindMeta(meta)}
        onRow={(record) => ({
          onClick: () => router.push(`/approvals/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<AuditOutlined />}
              title="No approval requests"
              description={
                inbox === 'PENDING_MY_ACTION'
                  ? 'Nothing is waiting for your action.'
                  : inbox === 'ALL'
                    ? 'No approval requests match the current filters.'
                    : 'Requests you submit will appear here.'
              }
            />
          ),
        }}
      />
    </FormLayout>
  );
}
