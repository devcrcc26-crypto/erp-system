'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from 'antd';
import { CarOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ListSearchInput from '@/components/ui/ListSearchInput/ListSearchInput';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import TableEmptyState from '@/components/ui/TableEmptyState';
import TableUpdatingIndicator from '@/components/ui/TableUpdatingIndicator/TableUpdatingIndicator';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { useAppMessage } from '@/hooks/use-app-message';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  CompanyVehicleListItem,
  CreateCompanyVehiclePayload,
  UpdateCompanyVehiclePayload,
  VehicleStatus,
} from '@/lib/api/company-vehicle.types';
import {
  useCompanyVehicles,
  useCreateCompanyVehicle,
  useUpdateCompanyVehicle,
  useUpdateCompanyVehicleStatus,
  useDeleteCompanyVehicle,
} from '@/lib/query/company-vehicle';
import { useFullUsersDirectory } from '@/lib/query/users';
import {
  formatDriverName,
  formatFuelType,
  formatVehicleStatus,
  formatVehicleType,
  toDriverSelectOptions,
  vehicleStatusVariant,
} from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

type DrawerMode = 'create' | 'edit';

export default function VehiclesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();

  const vehicleStatusOptions = useMemo(
    () => [
      { value: 'AVAILABLE', label: t('hr.vehicleStatus.AVAILABLE') },
      { value: 'APPROVED', label: t('hr.vehicleStatus.APPROVED') },
      { value: 'IN_USE', label: t('hr.vehicleStatus.IN_USE') },
      { value: 'MAINTENANCE', label: t('hr.vehicleStatus.MAINTENANCE') },
      { value: 'RETIRED', label: t('hr.vehicleStatus.RETIRED') },
    ],
    [t],
  );

  const vehicleTypeOptions = useMemo(
    () => [
      { value: 'CAR', label: t('hr.vehicleType.CAR') },
      { value: 'TRUCK', label: t('hr.vehicleType.TRUCK') },
      { value: 'VAN', label: t('hr.vehicleType.VAN') },
      { value: 'BUS', label: t('hr.vehicleType.BUS') },
      { value: 'PICKUP', label: t('hr.vehicleType.PICKUP') },
      { value: 'MOTORCYCLE', label: t('hr.vehicleType.MOTORCYCLE') },
      { value: 'OTHER', label: t('hr.vehicleType.OTHER') },
    ],
    [t],
  );

  const fuelTypeOptions = useMemo(
    () => [
      { value: 'PETROL', label: t('hr.fuelType.PETROL') },
      { value: 'DIESEL', label: t('hr.fuelType.DIESEL') },
      { value: 'ELECTRIC', label: t('hr.fuelType.ELECTRIC') },
      { value: 'HYBRID', label: t('hr.fuelType.HYBRID') },
    ],
    [t],
  );
  const messageApi = useAppMessage();
  const { params, resetPage, bindMeta } = useTablePagination();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create');
  const [editingVehicle, setEditingVehicle] =
    useState<CompanyVehicleListItem | null>(null);
  const [statusModalVehicle, setStatusModalVehicle] =
    useState<CompanyVehicleListItem | null>(null);
  const [newStatus, setNewStatus] = useState<VehicleStatus | undefined>();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form] = Form.useForm<CreateCompanyVehiclePayload>();

  const listParams = useMemo(
    () => ({
      ...params,
      search: search.trim() || undefined,
      status: statusFilter,
    }),
    [params, search, statusFilter],
  );

  const listQuery = useCompanyVehicles(listParams);
  const usersQuery = useFullUsersDirectory();
  const createMutation = useCreateCompanyVehicle();
  const updateMutation = useUpdateCompanyVehicle(editingVehicle?.id ?? '');
  const deleteMutation = useDeleteCompanyVehicle();
  const statusMutation = useUpdateCompanyVehicleStatus(
    statusModalVehicle?.id ?? '',
  );

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta;
  const driverOptions = useMemo(
    () =>
      toDriverSelectOptions(
        usersQuery.data ?? [],
        editingVehicle?.assignedDriverId
          ? [editingVehicle.assignedDriverId]
          : [],
      ),
    [usersQuery.data, editingVehicle?.assignedDriverId],
  );

  function openCreate(): void {
    setDrawerMode('create');
    setEditingVehicle(null);
    form.resetFields();
    setDrawerOpen(true);
  }

  function openEdit(vehicle: CompanyVehicleListItem): void {
    setDrawerMode('edit');
    setEditingVehicle(vehicle);
    form.setFieldsValue({
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuelType,
      color: vehicle.color ?? undefined,
      assignedDriverId: vehicle.assignedDriverId ?? undefined,
      notes: vehicle.notes ?? undefined,
      isActive: vehicle.isActive,
    });
    setDrawerOpen(true);
  }

  function openStatusChange(vehicle: CompanyVehicleListItem): void {
    setStatusModalVehicle(vehicle);
    setNewStatus(vehicle.status);
  }

  async function handleSubmit(): Promise<void> {
    try {
      const values = await form.validateFields();
      if (drawerMode === 'create') {
        await createMutation.mutateAsync(values);
        messageApi.success('Vehicle created');
      } else {
        const payload: UpdateCompanyVehiclePayload = { ...values };
        await updateMutation.mutateAsync(payload);
        messageApi.success('Vehicle updated');
      }
      setDrawerOpen(false);
      form.resetFields();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      notifyApiError(error, 'Failed to save vehicle', messageApi);
    }
  }

  async function handleStatusChange(): Promise<void> {
    if (!statusModalVehicle || !newStatus) return;
    try {
      await statusMutation.mutateAsync({ status: newStatus });
      messageApi.success('Vehicle status updated');
      setStatusModalVehicle(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to update status', messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync(deleteId);
      messageApi.success('Vehicle deleted');
      setDeleteId(null);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to delete vehicle', messageApi);
    }
  }

  const columns: ColumnsType<CompanyVehicleListItem> = [
    {
      title: 'Plate Number',
      dataIndex: 'plateNumber',
      key: 'plateNumber',
      width: 130,
    },
    {
      title: 'Type',
      dataIndex: 'vehicleType',
      key: 'vehicleType',
      width: 110,
      render: (v: string) => formatVehicleType(v, t),
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: 70,
      align: 'right',
    },
    {
      title: 'Fuel',
      dataIndex: 'fuelType',
      key: 'fuelType',
      width: 90,
      render: (v: string) => formatFuelType(v, t),
    },
    {
      title: 'Assigned Driver',
      key: 'assignedDriver',
      width: 160,
      ellipsis: true,
      render: (_: unknown, row: CompanyVehicleListItem) =>
        formatDriverName(row.assignedDriver),
    },
    {
      title: 'Status',
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
      width: 200,
      render: (_: unknown, row: CompanyVehicleListItem) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => openStatusChange(row)}
          >
            Status
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => setDeleteId(row.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

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
              : 'Failed to load vehicles'
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
          placeholder="Search plate, make, or model"
          style={{ width: 260 }}
        />

        <Select
          allowClear
          placeholder="Status"
          options={vehicleStatusOptions}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            resetPage();
          }}
          style={{ minWidth: 140 }}
        />

        <div className="ml-auto">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Vehicle
          </Button>
        </div>
      </div>

      {listQuery.isFetching && listQuery.data ? (
        <TableUpdatingIndicator active={listQuery.isFetching} />
      ) : null}

      <DataTable<CompanyVehicleListItem>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={listQuery.isLoading}
        pagination={meta ? bindMeta(meta) : false}
        locale={{
          emptyText: (
            <TableEmptyState
              icon={<CarOutlined />}
              title="No vehicles found"
              description="Add your first company vehicle to get started."
            />
          ),
        }}
      />

      <Drawer
        title={drawerMode === 'create' ? 'Add Vehicle' : 'Edit Vehicle'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={480}
        destroyOnClose
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              type="primary"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={() => void handleSubmit()}
            >
              {drawerMode === 'create' ? 'Create' : 'Save'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="plateNumber"
            label="Plate Number"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input maxLength={20} placeholder="e.g. AA-12345" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="vehicleType"
              label="Vehicle Type"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select options={vehicleTypeOptions} placeholder="Select type" />
            </Form.Item>
            <Form.Item
              name="fuelType"
              label="Fuel Type"
            >
              <Select
                options={fuelTypeOptions}
                placeholder="Select fuel"
                allowClear
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="make"
              label="Make"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input maxLength={100} placeholder="e.g. Toyota" />
            </Form.Item>
            <Form.Item
              name="model"
              label="Model"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input maxLength={100} placeholder="e.g. Hilux" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item
              name="year"
              label="Year"
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber
                min={1980}
                max={2100}
                style={{ width: '100%' }}
                placeholder="e.g. 2024"
              />
            </Form.Item>
            <Form.Item name="color" label="Color">
              <Input maxLength={50} placeholder="e.g. White" />
            </Form.Item>
          </div>

          <Form.Item name="assignedDriverId" label="Assigned Driver">
            <Select
              showSearch
              allowClear
              placeholder="Select driver"
              loading={usersQuery.isLoading}
              notFoundContent={
                usersQuery.isLoading
                  ? 'Loading...'
                  : 'No users with Driver position'
              }
              filterOption={(input, option) =>
                String(option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              options={driverOptions}
            />
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(statusModalVehicle)}
        title="Change Vehicle Status"
        description={`Update status for ${statusModalVehicle?.plateNumber ?? 'vehicle'}`}
        confirmLabel="Update Status"
        confirmLoading={statusMutation.isPending}
        onConfirm={() => void handleStatusChange()}
        onCancel={() => setStatusModalVehicle(null)}
      >
        <Select
          value={newStatus}
          onChange={setNewStatus}
          options={vehicleStatusOptions}
          style={{ width: '100%', marginTop: 8 }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete vehicle?"
        description="This will permanently remove the vehicle from the fleet."
        confirmLabel="Delete"
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
