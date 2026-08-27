'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Select,
  Space,
  Spin,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  VehicleRefuelingListItem,
  VehicleRefuelingStatus,
} from '@/lib/api/vehicle-refueling.types';
import { useVehicleRefuelings } from '@/lib/query/vehicle-refueling';
import { useUsersDirectory } from '@/lib/query/users';
import { tokens } from '@/lib/theme/tokens';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatUserName } from '@/lib/utils/user-display';

const { RangePicker } = DatePicker;

const PENDING_STATUSES: VehicleRefuelingStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
];

/**
 * Company or personal vehicle refueling list with filters and stats.
 */
export default function VehicleRefuelingListPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const canViewHr = useCanViewHr();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleRefuelingStatus[]>(
    [],
  );
  const [employeeId, setEmployeeId] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    null,
  );

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

  const pageTitle = canViewHr
    ? t('pages.hr.vehicleRefueling.listTitle')
    : t('pages.hr.vehicleRefueling.myListTitle');
  const pageDescription = canViewHr
    ? t('pages.hr.vehicleRefueling.listDescription')
    : t('pages.hr.vehicleRefueling.myListDescription');

  const countsBaseParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      employeeId: canViewHr ? employeeId : undefined,
      dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [search, canViewHr, employeeId, dateRange],
  );

  const listParams = useMemo(
    () => ({
      ...params,
      ...countsBaseParams,
      status: statusFilter.length > 0 ? statusFilter : undefined,
    }),
    [params, countsBaseParams, statusFilter],
  );

  const listQuery = useVehicleRefuelings(listParams, true);
  const totalCountQuery = useVehicleRefuelings(
    { page: 1, limit: 1, ...countsBaseParams },
    true,
  );
  const pendingCountQuery = useVehicleRefuelings(
    { page: 1, limit: 1, status: PENDING_STATUSES, ...countsBaseParams },
    true,
  );
  const approvedCountQuery = useVehicleRefuelings(
    { page: 1, limit: 1, status: ['APPROVED'], ...countsBaseParams },
    true,
  );
  const rejectedCountQuery = useVehicleRefuelings(
    { page: 1, limit: 1, status: ['REJECTED'], ...countsBaseParams },
    true,
  );
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const totalCount = meta?.total ?? rows.length;

  const statusCounts = {
    all: totalCountQuery.data?.meta?.total ?? totalCount,
    pending: pendingCountQuery.data?.meta?.total ?? 0,
    approved: approvedCountQuery.data?.meta?.total ?? 0,
    rejected: rejectedCountQuery.data?.meta?.total ?? 0,
  };

  const columns: ColumnsType<VehicleRefuelingListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
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
              width: 200,
              responsive: ['md'],
              render: (_: unknown, row: VehicleRefuelingListItem) => (
                <div className="min-w-0 py-0.5">
                  <p
                    className="m-0 text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {formatVehicleRefuelingEmployeeName(row.employee)}
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
            } satisfies ColumnsType<VehicleRefuelingListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.vehicle'),
        key: 'vehicle',
        width: 160,
        render: (_: unknown, row: VehicleRefuelingListItem) => (
          <div className="min-w-0">
            <p
              className="m-0 truncate text-sm font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {row.vehicle?.plateNumber ?? '—'}
            </p>
            {row.vehicle ? (
              <p
                className="m-0 truncate text-xs"
                style={{ color: tokens.colorTextTertiary }}
              >
                {row.vehicle.make} {row.vehicle.model}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        title: t('hr.table.fuelDate'),
        dataIndex: 'fuelDate',
        key: 'fuelDate',
        width: 120,
        responsive: ['md'],
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.table.fuelType'),
        dataIndex: 'fuelType',
        key: 'fuelType',
        width: 100,
        responsive: ['lg'],
        render: (value: string) => formatFuelType(value, t),
      },
      {
        title: t('hr.table.fuelStation'),
        dataIndex: 'fuelStation',
        key: 'fuelStation',
        ellipsis: true,
      },
      {
        title: t('hr.table.litres'),
        dataIndex: 'requestedLitres',
        key: 'requestedLitres',
        width: 80,
        align: 'right',
        responsive: ['md'],
        render: (value: number | string | null | undefined) => value ?? '—',
      },
      {
        title: t('hr.table.estimatedCost'),
        dataIndex: 'estimatedCostEtb',
        key: 'estimatedCostEtb',
        width: 110,
        align: 'right',
        responsive: ['lg'],
        render: (value: number | string | null | undefined) => value ?? '—',
      },
      {
        title: t('hr.table.status'),
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: VehicleRefuelingStatus) => (
          <StatusBadge
            label={formatVehicleRefuelingStatus(value, t)}
            variant={vehicleRefuelingStatusVariant(value)}
          />
        ),
      },
      {
        title: t('hr.table.currentTier'),
        dataIndex: 'currentTierLabel',
        key: 'currentTierLabel',
        width: 140,
        ellipsis: true,
        responsive: ['lg'],
        render: (_: string | null | undefined, row: VehicleRefuelingListItem) =>
          row.directApproved
            ? t('hr.labels.directApproval')
            : (row.currentTierLabel ?? '—'),
      },
    ],
    [canViewHr, t],
  );

  function handleResetFilters(): void {
    setSearch('');
    setStatusFilter([]);
    setEmployeeId(undefined);
    setDateRange(null);
    resetPage();
  }

  const hasFilters =
    Boolean(search.trim()) ||
    statusFilter.length > 0 ||
    employeeId !== undefined ||
    Boolean(dateRange?.[0] || dateRange?.[1]);

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className="flex justify-center rounded-none border border-[rgba(0,0,0,0.08)] bg-white p-12">
        <Spin />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page flex flex-col gap-3">
      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('hr.messages.vehicleRefuelingLoadFailed')
          }
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('pages.approvals.stats.total')}
          value={statusCounts.all}
          color="teal"
          icon={<ThunderboltOutlined />}
        />
        <StatCard
          label={t('pages.approvals.stats.pending')}
          value={statusCounts.pending}
          color="amber"
          icon={<ClockCircleOutlined />}
        />
        <StatCard
          label={t('pages.approvals.stats.approved')}
          value={statusCounts.approved}
          color="blue"
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label={t('pages.approvals.stats.rejected')}
          value={statusCounts.rejected}
          color="red"
          icon={<CloseCircleOutlined />}
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
            placeholder={t('hr.placeholder.searchRefueling')}
            className="w-full min-w-0 sm:w-72"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder={t('hr.placeholder.status')}
            options={statusOptions}
            value={statusFilter}
            onChange={(value: VehicleRefuelingStatus[]) => {
              setStatusFilter(value);
              resetPage();
            }}
            maxTagCount="responsive"
            className="w-full min-w-0 sm:min-w-[180px] sm:w-auto"
          />
          {canViewHr ? (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('hr.placeholder.employee')}
              loading={usersQuery.isLoading}
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
          <RangePicker
            value={dateRange}
            className="w-full min-w-0 sm:min-w-[260px] sm:w-auto"
            onChange={(value) => {
              setDateRange(value);
              resetPage();
            }}
            placeholder={[t('hr.placeholder.dateFrom'), t('hr.placeholder.dateTo')]}
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

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ThunderboltOutlined
              style={{ color: tokens.colorPrimary, fontSize: 16 }}
            />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {pageTitle}
            </h3>
            <span className="text-xs" style={{ color: tokens.colorTextTertiary }}>
              {totalCount}{' '}
              {totalCount === 1
                ? t('pages.hr.vehicleRefueling.requestSingular')
                : t('pages.hr.vehicleRefueling.requestPlural')}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/approvals/new/vehicle-refueling')}
              style={{ borderRadius: 0 }}
            >
              {t('hr.buttons.newVehicleRefueling')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<VehicleRefuelingListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            columns={columns}
            dataSource={rows}
            loading={listQuery.isFetching && !listQuery.isLoading}
            scroll={false}
            onRow={(record) => ({
              onClick: () =>
                router.push(`/hr/vehicle-refueling/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<ThunderboltOutlined style={{ fontSize: 24 }} />}
                  title={t('hr.empty.noRefuelingRequests')}
                  description={pageDescription}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('hr.buttons.newVehicleRefueling'),
                          onClick: () =>
                            router.push('/approvals/new/vehicle-refueling'),
                        }
                  }
                />
              ),
            }}
            pagination={
              meta
                ? {
                    ...bindMeta(meta),
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
