'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dropdown,
  Input,
  Select,
  Space,
  Spin,
  Tooltip,
  type MenuProps,
} from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { CarFront } from 'lucide-react';
import { StatCard } from '@/components/modules/dashboard/DashboardStats';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import VehicleChangeStatusDialog from '@/components/modules/org/vehicles/VehicleChangeStatusDialog';
import VehiclePhoto from '@/components/modules/org/vehicles/VehiclePhoto';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CompanyVehicleListItem,
  VehicleStatus,
} from '@/lib/api/company-vehicle.types';
import {
  useCompanyVehicles,
  useDeleteCompanyVehicle,
  useUpdateCompanyVehicleStatus,
} from '@/lib/query/company-vehicle';
import {
  formatDriverName,
  formatFuelType,
  formatVehicleStatus,
  formatVehicleType,
  vehicleStatusSelectOptions,
  initialVehicleStatusChangeSelection,
  vehicleStatusVariant,
} from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

export default function VehiclesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const router = useRouter();
  const { params, resetPage, bindMeta } = useTablePagination(10);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | undefined>();
  const [statusModalVehicle, setStatusModalVehicle] =
    useState<CompanyVehicleListItem | null>(null);
  const [newStatus, setNewStatus] = useState<VehicleStatus | undefined>();
  const [deleteVehicle, setDeleteVehicle] =
    useState<CompanyVehicleListItem | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const vehicleStatusOptions = useMemo(
    () => vehicleStatusSelectOptions(t),
    [t],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = search.trim();
      setAppliedSearch((prev) => {
        if (prev !== next) {
          setTimeout(() => resetPage(), 0);
        }
        return next;
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, resetPage]);

  const listParams = useMemo(
    () => ({
      ...params,
      search: appliedSearch || undefined,
      status: statusFilter,
    }),
    [params, appliedSearch, statusFilter],
  );

  const listQuery = useCompanyVehicles(listParams);
  const statsQuery = useCompanyVehicles({ page: 1, limit: 500 });
  const deleteMutation = useDeleteCompanyVehicle();
  const statusMutation = useUpdateCompanyVehicleStatus(
    statusModalVehicle?.id ?? '',
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? {
    total: 0,
    page: params.page ?? 1,
    limit: params.limit ?? 10,
    pages: 0,
  };

  const vehicleStats = useMemo(() => {
    const all = statsQuery.data?.data ?? [];
    let availableCount = 0;
    let inUseCount = 0;
    let maintenanceCount = 0;
    for (const vehicle of all) {
      if (vehicle.status === 'AVAILABLE' || vehicle.status === 'APPROVED') {
        availableCount += 1;
      } else if (vehicle.status === 'IN_USE') {
        inUseCount += 1;
      } else if (
        vehicle.status === 'MAINTENANCE' ||
        vehicle.status === 'RETIRED'
      ) {
        maintenanceCount += 1;
      }
    }
    return {
      totalCount: statsQuery.data?.meta.total ?? all.length,
      availableCount,
      inUseCount,
      maintenanceCount,
    };
  }, [statsQuery.data]);

  function handleResetFilters(): void {
    setSearch('');
    setAppliedSearch('');
    setStatusFilter(undefined);
    resetPage();
  }

  async function handleRefresh(): Promise<void> {
    await Promise.all([listQuery.refetch(), statsQuery.refetch()]);
  }

  function openStatusChange(vehicle: CompanyVehicleListItem): void {
    setStatusModalVehicle(vehicle);
    setNewStatus(initialVehicleStatusChangeSelection(vehicle.status));
  }

  async function handleStatusChange(): Promise<void> {
    if (!statusModalVehicle || !newStatus) {
      return;
    }
    setActionMessage(null);
    try {
      await statusMutation.mutateAsync({ status: newStatus });
      setActionMessage({
        type: 'success',
        text: t('vehicles.statusUpdated'),
      });
      setStatusModalVehicle(null);
    } catch (error: unknown) {
      notifyApiError(error, t('vehicles.statusUpdateError'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteVehicle) {
      return;
    }
    setActionMessage(null);
    try {
      await deleteMutation.mutateAsync(deleteVehicle.id);
      setActionMessage({
        type: 'success',
        text: t('vehicles.deleted', { plate: deleteVehicle.plateNumber }),
      });
      setDeleteVehicle(null);
    } catch (error: unknown) {
      notifyApiError(error, t('vehicles.deleteError'), messageApi);
    }
  }

  const buildActionMenu = useCallback(
    (vehicle: CompanyVehicleListItem): MenuProps['items'] => [
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: t('common.update'),
        onClick: () => router.push(`/organization/vehicles/${vehicle.id}/edit`),
      },
      {
        key: 'status',
        icon: <ToolOutlined />,
        label: t('vehicles.changeStatus'),
        onClick: () => openStatusChange(vehicle),
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: t('common.delete'),
        danger: true,
        onClick: () => setDeleteVehicle(vehicle),
      },
    ],
    [router, t],
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

  const pagination = bindMeta(meta);

  return (
    <div className="flex flex-col gap-4">
      <VehicleChangeStatusDialog
        open={Boolean(statusModalVehicle)}
        plateNumber={statusModalVehicle?.plateNumber ?? ''}
        currentStatus={statusModalVehicle?.status ?? 'AVAILABLE'}
        pendingStatus={newStatus}
        confirmLoading={statusMutation.isPending}
        onPendingStatusChange={setNewStatus}
        onConfirm={() => void handleStatusChange()}
        onCancel={() => setStatusModalVehicle(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteVehicle)}
        title={t('vehicles.deleteTitle')}
        description={
          deleteVehicle
            ? t('vehicles.deleteDescription', {
                plate: deleteVehicle.plateNumber,
              })
            : undefined
        }
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteVehicle(null)}
      />

      {actionMessage ? (
        <Alert
          type={actionMessage.type === 'success' ? 'success' : 'error'}
          showIcon
          title={actionMessage.text}
          closable
          onClose={() => setActionMessage(null)}
        />
      ) : null}

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title={
            listQuery.error instanceof ApiRequestError
              ? listQuery.error.message
              : t('vehicles.loadError')
          }
        />
      ) : null}

      <div className="mb-1 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t('vehicles.stats.total')}
          value={vehicleStats.totalCount}
          color="teal"
          icon={<CarFront size={14} />}
        />
        <StatCard
          label={t('vehicles.stats.available')}
          value={vehicleStats.availableCount}
          color="green"
          icon={<CheckCircleOutlined />}
        />
        <StatCard
          label={t('vehicles.stats.inUse')}
          value={vehicleStats.inUseCount}
          color="amber"
          icon={<CarOutlined />}
        />
        <StatCard
          label={t('vehicles.stats.maintenanceRetired')}
          value={vehicleStats.maintenanceCount}
          color="default"
          icon={<ToolOutlined />}
        />
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="erp-filter-bar">
          <Input.Search
            placeholder={t('vehicles.searchPlaceholder')}
            className="w-full min-w-0 sm:w-72"
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
            placeholder={t('vehicles.filterStatus')}
            className="w-full min-w-0 sm:w-40"
            allowClear
            options={vehicleStatusOptions}
            value={statusFilter}
            onChange={(value?: VehicleStatus) => {
              setStatusFilter(value);
              resetPage();
            }}
          />
          <Button onClick={handleResetFilters} style={{ borderRadius: 0 }}>
            {t('common.reset')}
          </Button>
          <Tooltip title={t('common.refresh')}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              loading={listQuery.isFetching && !listQuery.isLoading}
              onClick={() => void handleRefresh()}
              aria-label={t('common.refresh')}
              style={{ borderRadius: 0 }}
            />
          </Tooltip>
        </div>
      </div>

      <div className="rounded-none border border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CarFront size={16} style={{ color: tokens.colorPrimary }} />
            <h3
              className="m-0 text-sm font-semibold"
              style={{ color: tokens.colorTextPrimary }}
            >
              {t('vehicles.allVehicles')}
            </h3>
            <span
              className="text-xs"
              style={{ color: tokens.colorTextTertiary }}
            >
              {meta.total === 1
                ? t('vehicles.vehicleCountOne')
                : t('vehicles.vehicleCount', { count: meta.total })}
            </span>
          </div>
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => router.push('/organization/vehicles/new')}
              style={{ borderRadius: 0 }}
            >
              {t('vehicles.addVehicle')}
            </Button>
          </Space>
        </div>

        <div className="px-0">
          <DataTable<CompanyVehicleListItem>
            rowKey="id"
            className="erp-pro-table"
            size="small"
            dataSource={rows}
            scroll={false}
            loading={listQuery.isLoading}
            pagination={
              pagination
                ? {
                    ...pagination,
                    pageSizeOptions: ['10', '20', '50', '100'],
                  }
                : undefined
            }
            onRow={(record) => ({
              onClick: () =>
                router.push(`/organization/vehicles/${record.id}`),
              className: 'cursor-pointer transition-colors hover:bg-[#F8F7F4]',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CarFront />}
                  title={t('hr.empty.noVehicles')}
                  description={t('vehicles.emptyDescription')}
                  action={{
                    label: t('vehicles.addVehicle'),
                    onClick: () => router.push('/organization/vehicles/new'),
                  }}
                />
              ),
            }}
            columns={[
              {
                title: t('vehicles.form.photo'),
                key: 'photo',
                width: 56,
                render: (_: unknown, record: CompanyVehicleListItem) => (
                  <div onClick={(event) => event.stopPropagation()}>
                    <VehiclePhoto
                      vehicleId={record.id}
                      photoDocumentId={record.photoDocumentId}
                      plateNumber={record.plateNumber}
                      canEdit={false}
                      variant="thumb"
                      size={40}
                    />
                  </div>
                ),
              },
              {
                title: t('hr.table.plateNumber'),
                dataIndex: 'plateNumber',
                key: 'plateNumber',
                width: 130,
                render: (plate: string) => (
                  <span
                    className="font-[family-name:var(--font-mono)] text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                  >
                    {plate}
                  </span>
                ),
              },
              {
                title: t('vehicles.form.vehicleType'),
                dataIndex: 'vehicleType',
                key: 'vehicleType',
                width: 110,
                responsive: ['md'],
                render: (value: string) => formatVehicleType(value, t),
              },
              {
                title: t('hr.table.make'),
                dataIndex: 'make',
                key: 'make',
                width: 120,
                ellipsis: true,
                responsive: ['md'],
              },
              {
                title: t('hr.table.model'),
                dataIndex: 'model',
                key: 'model',
                width: 120,
                ellipsis: true,
                responsive: ['lg'],
              },
              {
                title: t('hr.table.year'),
                dataIndex: 'year',
                key: 'year',
                width: 70,
                align: 'right',
                responsive: ['lg'],
              },
              {
                title: t('hr.table.fuelType'),
                dataIndex: 'fuelType',
                key: 'fuelType',
                width: 90,
                responsive: ['lg'],
                render: (value: string) => formatFuelType(value, t),
              },
              {
                title: t('hr.table.assignedDriver'),
                key: 'assignedDriver',
                width: 160,
                ellipsis: true,
                responsive: ['md'],
                render: (_: unknown, row: CompanyVehicleListItem) =>
                  formatDriverName(row.assignedDriver),
              },
              {
                title: t('hr.table.status'),
                dataIndex: 'status',
                key: 'status',
                width: 120,
                render: (value: VehicleStatus) => (
                  <StatusBadge
                    label={formatVehicleStatus(value, t)}
                    variant={vehicleStatusVariant(value)}
                  />
                ),
              },
              {
                title: '',
                key: 'actions',
                width: 56,
                render: (_: unknown, record: CompanyVehicleListItem) => (
                  <div
                    className="flex items-center justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Dropdown
                      menu={{ items: buildActionMenu(record) }}
                      trigger={['click']}
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={t('vehicles.actionsFor', {
                          plate: record.plateNumber,
                        })}
                        style={{ borderRadius: 0 }}
                      />
                    </Dropdown>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
