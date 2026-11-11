'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Dropdown,
  Grid,
  Input,
  Select,
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
  ReloadOutlined,
  SearchOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { CarFront } from 'lucide-react';
import { OrgListStat } from '@/components/modules/org/OrgListStat';
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
import HrListActions from '@/components/modules/hr/import-export/HrListActions';
import ImportModal from '@/components/modules/hr/import-export/ImportModal';
import { fetchAllCompanyVehicles } from '@/lib/query/company-vehicle';
import { buildCompanyVehicleExportSheets } from '@/lib/utils/company-vehicle-export';
import { companyVehicleImportSchema } from '@/lib/utils/hr-import-configs';
import { notifyApiError } from '@/lib/utils/notify-api-error';

import { LIST_PAGE_V2 } from '@/components/ui/list-page-v2';
/**
 * Company vehicles list - Users chrome (stat bar, filter row, rounded table).
 */
export default function VehiclesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
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

  const [importOpen, setImportOpen] = useState(false);
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

  function handleStatusStatFilter(next: VehicleStatus | undefined): void {
    setStatusFilter(next);
    resetPage();
  }

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

  const hasFilters =
    Boolean(appliedSearch.trim()) || statusFilter !== undefined;

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <div className={`erp-pro-list-page erp-users-page erp-org-vehicles-page ${LIST_PAGE_V2}`}>
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  const pagination = bindMeta(meta);

  return (
    <div className={`erp-pro-list-page erp-users-page erp-org-vehicles-page ${LIST_PAGE_V2}`}>
      {importOpen ? (
        <ImportModal
          schema={companyVehicleImportSchema}
          title={t('hr.exportImport.companyVehicles.title')}
          description={t('hr.exportImport.companyVehicles.description')}
          onClose={() => setImportOpen(false)}
          onImported={() => void handleRefresh()}
        />
      ) : null}

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

      <div className="erp-users-stat-bar">
        <OrgListStat
          label={t('vehicles.stats.total')}
          value={vehicleStats.totalCount}
          accent="teal"
          icon={<CarFront size={14} strokeWidth={2} />}
          active={statusFilter === undefined}
          onClick={() => handleStatusStatFilter(undefined)}
        />
        <OrgListStat
          label={t('vehicles.stats.available')}
          value={vehicleStats.availableCount}
          accent="green"
          icon={<CheckCircleOutlined />}
          active={statusFilter === 'AVAILABLE'}
          onClick={() => handleStatusStatFilter('AVAILABLE')}
        />
        <OrgListStat
          label={t('vehicles.stats.inUse')}
          value={vehicleStats.inUseCount}
          accent="amber"
          icon={<CarOutlined />}
          active={statusFilter === 'IN_USE'}
          onClick={() => handleStatusStatFilter('IN_USE')}
        />
        <OrgListStat
          label={t('vehicles.stats.maintenanceRetired')}
          value={vehicleStats.maintenanceCount}
          accent="slate"
          icon={<ToolOutlined />}
          active={statusFilter === 'MAINTENANCE'}
          onClick={() => handleStatusStatFilter('MAINTENANCE')}
        />
      </div>

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-users-toolbar">
          <div className="erp-users-toolbar-title flex min-w-0 items-center gap-2.5">
            <h3 className="erp-pro-card-toolbar-title">
              {t('vehicles.allVehicles')}
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
                onClick={() => void handleRefresh()}
                aria-label={t('common.refresh')}
              />
            </Tooltip>
            <HrListActions
              compact={isCompact}
              exports={[
                {
                  key: 'vehicles',
                  label: t('hr.exportImport.companyVehicles.export'),
                  filePrefix: 'company-vehicles',
                  disabled: meta.total === 0,
                  buildSheets: async () =>
                    buildCompanyVehicleExportSheets(
                      await fetchAllCompanyVehicles({
                        search: appliedSearch || undefined,
                        status: statusFilter,
                      }),
                    ),
                },
              ]}
              onImport={() => setImportOpen(true)}
              primary={{
                label: t('vehicles.addVehicle'),
                onClick: () => router.push('/organization/vehicles/new'),
              }}
            />
          </div>
        </div>

        <div className="erp-users-filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined className="erp-users-search-icon" />}
            placeholder={t('vehicles.searchPlaceholder')}
            className="erp-users-search-input min-w-0"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
            placeholder={t('vehicles.filterStatus')}
            className="erp-users-filter-select"
            allowClear
            options={vehicleStatusOptions}
            value={statusFilter}
            onChange={(value?: VehicleStatus) => {
              setStatusFilter(value);
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
          <DataTable<CompanyVehicleListItem>
            rowKey="id"
            className="erp-pro-table erp-users-table"
            size={isCompact ? 'small' : 'middle'}
            dataSource={rows}
            scroll={{ x: isNarrow ? 520 : isCompact ? 720 : 1000 }}
            loading={listQuery.isLoading}
            pagination={
              pagination
                ? {
                    ...pagination,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    simple: isNarrow,
                    showSizeChanger: !isNarrow,
                  }
                : undefined
            }
            onRow={(record) => ({
              onClick: () =>
                router.push(`/organization/vehicles/${record.id}`),
              className: 'cursor-pointer',
            })}
            locale={{
              emptyText: (
                <TableEmptyState
                  icon={<CarFront size={28} strokeWidth={1.5} />}
                  title={t('hr.empty.noVehicles')}
                  description={t('vehicles.emptyDescription')}
                  action={
                    hasFilters
                      ? {
                          label: t('common.reset'),
                          onClick: handleResetFilters,
                        }
                      : {
                          label: t('vehicles.addVehicle'),
                          onClick: () =>
                            router.push('/organization/vehicles/new'),
                        }
                  }
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
                  <span className="erp-users-id-chip">{plate}</span>
                ),
              },
              {
                title: t('vehicles.form.vehicleType'),
                dataIndex: 'vehicleType',
                key: 'vehicleType',
                width: 110,
                responsive: ['md'],
                render: (value: string) => (
                  <span className="erp-users-cell-sub">
                    {formatVehicleType(value, t)}
                  </span>
                ),
              },
              {
                title: t('hr.table.make'),
                dataIndex: 'make',
                key: 'make',
                width: 120,
                ellipsis: true,
                responsive: ['md'],
                render: (value: string) => (
                  <span className="erp-users-cell-strong">{value}</span>
                ),
              },
              {
                title: t('hr.table.model'),
                dataIndex: 'model',
                key: 'model',
                width: 120,
                ellipsis: true,
                responsive: ['lg'],
                render: (value: string) => (
                  <span className="erp-users-cell-sub">{value}</span>
                ),
              },
              {
                title: t('hr.table.year'),
                dataIndex: 'year',
                key: 'year',
                width: 70,
                align: 'right',
                responsive: ['lg'],
                render: (value: number) => (
                  <span className="erp-users-cell-sub">{value}</span>
                ),
              },
              {
                title: t('hr.table.fuelType'),
                dataIndex: 'fuelType',
                key: 'fuelType',
                width: 90,
                responsive: ['lg'],
                render: (value: string) => (
                  <span className="erp-users-cell-sub">
                    {formatFuelType(value, t)}
                  </span>
                ),
              },
              {
                title: t('hr.table.assignedDriver'),
                key: 'assignedDriver',
                width: 160,
                ellipsis: true,
                responsive: ['md'],
                render: (_: unknown, row: CompanyVehicleListItem) => (
                  <span className="erp-users-cell-sub">
                    {formatDriverName(row.assignedDriver)}
                  </span>
                ),
              },
              {
                title: t('hr.table.status'),
                dataIndex: 'status',
                key: 'status',
                width: isNarrow ? 108 : 120,
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
