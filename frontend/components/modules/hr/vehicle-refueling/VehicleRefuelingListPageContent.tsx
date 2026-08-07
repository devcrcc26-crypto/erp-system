'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select } from 'antd';
import { PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
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
  VehicleRefuelingListItem,
  VehicleRefuelingStatus,
} from '@/lib/api/vehicle-refueling.types';
import { useVehicleRefuelings } from '@/lib/query/vehicle-refueling';
import { useUsersDirectory } from '@/lib/query/users';
import {
  formatVehicleRefuelingEmployeeName,
  formatVehicleRefuelingStatus,
  vehicleRefuelingStatusVariant,
} from '@/lib/utils/vehicle-refueling-display';
import { formatFuelType } from '@/lib/utils/company-vehicle-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const { RangePicker } = DatePicker;

export default function VehicleRefuelingListPageContent(): React.ReactNode {
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
  const [statusFilter, setStatusFilter] = useState<VehicleRefuelingStatus[]>([]);
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

  const listQuery = useVehicleRefuelings(listParams, true);
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: canViewHr },
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;

  const columns: ColumnsType<VehicleRefuelingListItem> = useMemo(
    () => [
      {
        title: t('hr.table.requestNumber'),
        dataIndex: 'requestNumber',
        key: 'requestNumber',
        width: 120,
      },
      ...(canViewHr
        ? [
            {
              title: t('hr.table.employee'),
              key: 'employee',
              render: (_: unknown, row: VehicleRefuelingListItem) =>
                formatVehicleRefuelingEmployeeName(row.employee),
            } satisfies ColumnsType<VehicleRefuelingListItem>[number],
          ]
        : []),
      {
        title: t('hr.table.vehicle'),
        key: 'vehicle',
        width: 130,
        render: (_: unknown, row: VehicleRefuelingListItem) =>
          row.vehicle?.plateNumber ?? '-',
      },
      {
        title: t('hr.table.fuelDate'),
        dataIndex: 'fuelDate',
        key: 'fuelDate',
        width: 120,
        render: (v: string) => formatProjectDate(v),
      },
      {
        title: t('hr.table.fuelType'),
        dataIndex: 'fuelType',
        key: 'fuelType',
        width: 90,
        render: (v: string) => formatFuelType(v, t),
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
        render: (v: number | string | null | undefined) => v ?? '-',
      },
      {
        title: t('hr.table.estimatedCost'),
        dataIndex: 'estimatedCostEtb',
        key: 'estimatedCostEtb',
        width: 100,
        align: 'right',
        render: (v: number | string | null | undefined) => v ?? '-',
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
        render: (_: string | null | undefined, row: VehicleRefuelingListItem) =>
          row.directApproved ? 'Direct approval' : (row.currentTierLabel ?? '-'),
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
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : 'Failed to load vehicle refueling requests'
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-[rgba(0,0,0,0.08)]">
        <ListSearchInput
          committedValue={search}
          onCommit={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={t('hr.placeholder.searchRefueling')}
          style={{ width: 260 }}
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

        <RangePicker
          style={{ width: 230 }}
          value={dateRange}
          onChange={(v) => {
            setDateRange(v as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
            resetPage();
          }}
          placeholder={[t('hr.placeholder.dateFrom'), t('hr.placeholder.dateTo')]}
        />

        <div className="ml-auto">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/approvals/new/vehicle-refueling')}
          >
            {t('hr.buttons.newVehicleRefueling')}
          </Button>
        </div>
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <DataTable<VehicleRefuelingListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isLoading}
        pagination={meta ? bindMeta(meta) : false}
        onRow={(row) => ({
          onClick: () => router.push(`/hr/vehicle-refueling/${row.id}`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<ThunderboltOutlined />}
              title={t('hr.empty.noRefuelingRequests')}
            />
          ),
        }}
      />
    </div>
  );
}
