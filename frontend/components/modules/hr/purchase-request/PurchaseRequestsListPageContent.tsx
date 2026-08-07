'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, InputNumber, Select } from 'antd';
import { PlusOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PurchaseRequestListItem,
  PurchaseRequestStatus,
} from '@/lib/api/purchase-request.types';
import { usePurchaseRequests } from '@/lib/query/purchase-request';
import { useUsersDirectory } from '@/lib/query/users';
import { useAllProjects } from '@/lib/query/projects';
import {
  formatEtbAmount,
  formatPurchaseRequestEmployeeName,
  formatPurchaseRequestStatus,
  purchaseRequestStatusVariant,
} from '@/lib/utils/purchase-request-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const { RangePicker } = DatePicker;

/**
 * Company or personal purchase request list with filters.
 */
export default function PurchaseRequestsListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();

  const statusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: t('hr.status.DRAFT') },
      { value: 'SUBMITTED', label: t('hr.status.SUBMITTED') },
      { value: 'IN_REVIEW', label: t('hr.status.IN_REVIEW') },
      { value: 'APPROVED', label: t('hr.status.APPROVED') },
      { value: 'REJECTED', label: t('hr.status.REJECTED') },
      { value: 'RETURNED', label: t('hr.status.RETURNED') },
      { value: 'CANCELLED', label: t('hr.status.CANCELLED') },
    ],
    [t],
  );
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseRequestStatus[]>([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(
    null,
  );
  const [amountMin, setAmountMin] = useState<number | undefined>();
  const [amountMax, setAmountMax] = useState<number | undefined>();

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      employeeId: canViewHr ? employeeId : undefined,
      projectId: projectFilter,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      amountMin,
      amountMax,
    }),
    [
      params,
      search,
      statusFilter,
      employeeId,
      projectFilter,
      dateRange,
      amountMin,
      amountMax,
      canViewHr,
    ],
  );

  const listQuery = usePurchaseRequests(listParams, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );
  const projectsQuery = useAllProjects({}, canViewHr);

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<PurchaseRequestListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 130,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              render: (_: unknown, row: PurchaseRequestListItem) =>
                formatPurchaseRequestEmployeeName(row.employee),
            } satisfies ColumnsType<PurchaseRequestListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.title'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: t('hr.table.items'),
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 70,
        align: 'right',
      },
      {
        title: t('hr.table.total'),
        dataIndex: 'totalEstimatedEtb',
        key: 'totalEstimatedEtb',
        width: 140,
        align: 'right',
        render: (value: number | string) => formatEtbAmount(value),
      },
      {
        title: t('hr.table.requiredBy'),
        dataIndex: 'requiredByDate',
        key: 'requiredByDate',
        width: 120,
        render: (value: string | null | undefined) =>
          value ? formatProjectDate(value) : '-',
      },
      {
        title: t('hr.table.project'),
        key: 'project',
        width: 150,
        ellipsis: true,
        render: (_: unknown, row: PurchaseRequestListItem) =>
          row.project?.name ?? '-',
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: PurchaseRequestStatus) => (
          <StatusBadge
            label={formatPurchaseRequestStatus(value, t)}
            variant={purchaseRequestStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        ellipsis: true,
        render: (value: string | null | undefined) => value ?? '-',
      },
    ],
    [canViewHr, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div>
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load purchase requests'
          }
        />
      ) : null}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.placeholder.searchPurchase')}
          style={{ width: 220 }}
        />

        <Select
          mode="multiple"
          allowClear
          placeholder={t('hr.placeholder.status')}
          options={statusOptions}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            resetPage();
          }}
          style={{ minWidth: 160 }}
          maxTagCount="responsive"
        />

        {canViewHr ? (
          <Select
            showSearch
            allowClear
            placeholder={t('hr.placeholder.employee')}
            loading={usersQuery.isLoading}
            value={employeeId}
            onChange={(v) => {
              setEmployeeId(v);
              resetPage();
            }}
            style={{ width: 200 }}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            options={
              usersQuery.data?.data?.map((u) => ({
                value: u.id,
                label: `${u.firstName} ${u.lastName}`,
              })) ?? []
            }
          />
        ) : null}

        {canViewHr ? (
          <Select
            showSearch
            allowClear
            placeholder={t('hr.placeholder.project')}
            loading={projectsQuery.isLoading}
            value={projectFilter}
            onChange={(v) => {
              setProjectFilter(v);
              resetPage();
            }}
            style={{ width: 200 }}
            filterOption={(input, option) =>
              String(option?.label ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            options={
              projectsQuery.data?.data?.map((p) => ({
                value: p.id,
                label: p.projectCode ? `[${p.projectCode}] ${p.name}` : p.name,
              })) ?? []
            }
          />
        ) : null}

        <RangePicker
          style={{ width: 230 }}
          value={dateRange}
          onChange={(v) => {
            setDateRange(
              v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null,
            );
            resetPage();
          }}
          placeholder={[t('hr.placeholder.dateFrom'), t('hr.placeholder.dateTo')]}
        />

        <InputNumber
          placeholder="Min amount (ETB)"
          value={amountMin}
          min={0}
          onChange={(v) => {
            setAmountMin(v ?? undefined);
            resetPage();
          }}
          style={{ width: 160 }}
        />

        <InputNumber
          placeholder="Max amount (ETB)"
          value={amountMax}
          min={0}
          onChange={(v) => {
            setAmountMax(v ?? undefined);
            resetPage();
          }}
          style={{ width: 160 }}
        />

        <div className="ml-auto">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/purchase-request')}
          >
            {t('hr.buttons.newPurchaseRequest')}
          </Button>
        </div>
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <DataTable<PurchaseRequestListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isLoading}
        pagination={meta ? bindMeta(meta) : false}
        onRow={(row) => ({
          onClick: () => router.push(`/hr/purchase-requests/${row.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<ShoppingCartOutlined />}
              title={t('hr.empty.noPurchaseRequests')}
            />
          ),
        }}
      />
    </div>
  );
}
