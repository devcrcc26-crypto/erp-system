'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select } from 'antd';
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
} from '@/lib/query/approvals';
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

/**
 * Company-wide approval request inbox.
 */
export default function ApprovalsListPageContent(): React.ReactNode {
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApprovalRequestStatus[]>([]);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(null);

  const categoriesQuery = useApprovalCategories();
  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      categoryId,
      dateFrom: dateRange?.[0]?.startOf('day').toISOString(),
      dateTo: dateRange?.[1]?.endOf('day').toISOString(),
    }),
    [params, search, statusFilter, categoryId, dateRange],
  );

  const listQuery = useApprovalRequests(listParams);
  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

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
        const display = resolveDisplayStatus(row.status, current);
        return <StatusBadge label={display.label} variant={display.variant} />;
      },
    },
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
        <Alert type="error" showIcon message={message} />
      </FormLayout>
    );
  }

  return (
    <FormLayout
      title="Approvals"
      description="Browse approval requests across the company."
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
              description="Submitted requests will appear here."
            />
          ),
        }}
      />
    </FormLayout>
  );
}
