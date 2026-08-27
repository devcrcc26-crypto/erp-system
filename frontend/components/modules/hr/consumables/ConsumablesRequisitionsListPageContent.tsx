'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select, Spin, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  ConsumablesRequisitionListItem,
  ConsumablesRequisitionStatus,
} from '@/lib/api/consumables-requisition.types';
import { useConsumablesRequisitions } from '@/lib/query/consumables-requisition';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatConsumablesRequisitionEmployeeName,
  formatConsumablesRequisitionStatus,
  consumablesRequisitionStatusVariant,
} from '@/lib/utils/consumables-requisition-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';

const { RangePicker } = DatePicker;

/**
 * Company or personal consumables requisition list with filters.
 */
export default function ConsumablesRequisitionsListPageContent(): React.ReactNode {
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
  const [statusFilter, setStatusFilter] = useState<
    ConsumablesRequisitionStatus[]
  >([]);
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<
    [dayjs.Dayjs | null, dayjs.Dayjs | null] | null
  >(null);

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [params, search, statusFilter, employeeId, dateRange, canViewHr],
  );

  const listQuery = useConsumablesRequisitions(listParams, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );
  const pendingStatuses = useMemo(
    () => ['DRAFT', 'SUBMITTED', 'IN_REVIEW'] as ConsumablesRequisitionStatus[],
    [],
  );
  const countsBaseParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [search, canViewHr, employeeId, dateRange],
  );
  const totalCountQuery = useConsumablesRequisitions(
    { page: 1, limit: 1, ...countsBaseParams },
    true,
  );
  const pendingCountQuery = useConsumablesRequisitions(
    { page: 1, limit: 1, status: pendingStatuses, ...countsBaseParams },
    true,
  );
  const approvedCountQuery = useConsumablesRequisitions(
    { page: 1, limit: 1, status: ['APPROVED'], ...countsBaseParams },
    true,
  );
  const rejectedCountQuery = useConsumablesRequisitions(
    { page: 1, limit: 1, status: ['REJECTED'], ...countsBaseParams },
    true,
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const pageTitle = useMemo(
    () =>
      canViewHr
        ? t('pages.hr.consumables.listTitle')
        : t('pages.hr.consumables.myListTitle'),
    [canViewHr, t],
  );
  const pageDescription = useMemo(
    () =>
      canViewHr
        ? t('pages.hr.consumables.listDescription')
        : t('pages.hr.consumables.myListDescription'),
    [canViewHr, t],
  );
  const statusCounts = {
    all: totalCountQuery.data?.meta?.total ?? rows.length,
    pending: pendingCountQuery.data?.meta?.total ?? 0,
    approved: approvedCountQuery.data?.meta?.total ?? 0,
    rejected: rejectedCountQuery.data?.meta?.total ?? 0,
  };

  const columns: ColumnsType<ConsumablesRequisitionListItem> = useMemo(
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
              render: (_: unknown, row: ConsumablesRequisitionListItem) =>
                formatConsumablesRequisitionEmployeeName(row.employee),
            } satisfies ColumnsType<ConsumablesRequisitionListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.title'),
        dataIndex: 'title',
        key: 'title',
        ellipsis: true,
      },
      {
        title: t('hr.table.department'),
        dataIndex: 'department',
        key: 'department',
        width: 140,
        ellipsis: true,
        render: (v: string | null | undefined) => v || '-',
      },
      {
        title: t('hr.table.items'),
        dataIndex: 'itemCount',
        key: 'itemCount',
        width: 70,
        align: 'right',
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
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: ConsumablesRequisitionStatus) => (
          <StatusBadge
            label={formatConsumablesRequisitionStatus(value, t)}
            variant={consumablesRequisitionStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        ellipsis: true,
        render: (_: string | null | undefined, row: ConsumablesRequisitionListItem) =>
          row.directApproved
            ? 'Direct approval'
            : (row.currentTierLabel ?? '-'),
      },
    ],
    [canViewHr, t],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    employeeId !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load consumables requisitions'
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('pages.approvals.stats.total')}
          value={statusCounts.all}
          color="teal"
          icon={<ShoppingOutlined size={14} />}
        />
        <StatCard
          label={t('pages.approvals.stats.pending')}
          value={statusCounts.pending}
          color="amber"
          icon={<ClockCircleOutlined size={14} />}
        />
        <StatCard
          label={t('pages.approvals.stats.approved')}
          value={statusCounts.approved}
          color="blue"
          icon={<CheckCircleOutlined size={14} />}
        />
        <StatCard
          label={t('pages.approvals.stats.rejected')}
          value={statusCounts.rejected}
          color="red"
          icon={<CloseCircleOutlined size={14} />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <ListSearchInput
            committedValue={search}
            onCommit={(value) => {
              setSearch(value);
              resetPage();
            }}
            placeholder={t('hr.placeholder.searchConsumables')}
            className="w-full min-w-0 sm:w-72"
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
            maxTagCount="responsive"
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
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
              className="w-full min-w-0 sm:w-56"
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

          <RangePicker
            value={dateRange}
            className="w-full min-w-0 sm:min-w-[260px] sm:w-auto"
            onChange={(v) => {
              setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
              resetPage();
            }}
            placeholder={[t('hr.placeholder.dateFrom'), t('hr.placeholder.dateTo')]}
          />

          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={() => {
                setSearch('');
                setStatusFilter([]);
                setEmployeeId(undefined);
                setDateRange(null);
                resetPage();
              }}
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
                style={{ borderRadius: 0 }}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ShoppingOutlined style={{ color: tokens.colorPrimary, fontSize: 16 }} />
            <h3 className="m-0 text-sm font-semibold" style={{ color: tokens.colorTextPrimary }}>
              {pageTitle}
            </h3>
            <span className="text-xs" style={{ color: tokens.colorTextTertiary }}>
              {meta?.total ?? rows.length}
            </span>
          </div>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/consumables')}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.newConsumables')}
          </Button>
        </div>

        <div className="px-0">
          <DataTable<ConsumablesRequisitionListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            scroll={false}
            loading={listQuery.isFetching && !listQuery.isLoading}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
            onRow={(row) => ({
              onClick: () => router.push(`/hr/consumables/${row.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ShoppingOutlined />}
                  title={t('hr.empty.noConsumablesRequests')}
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: () => {
                            setSearch('');
                            setStatusFilter([]);
                            setEmployeeId(undefined);
                            setDateRange(null);
                            resetPage();
                          },
                        }
                      : {
                          label: t('hr.buttons.newConsumables'),
                          onClick: () => router.push('/approvals/new/consumables'),
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
