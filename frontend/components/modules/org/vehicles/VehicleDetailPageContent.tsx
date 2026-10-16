'use client';

import { useState } from 'react';
import { Alert, Button, Skeleton, Space } from 'antd';
import { ArrowLeft, CarFront, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  MetaItem,
  SectionCard,
  SummaryStrip,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import VehicleChangeStatusDialog from '@/components/modules/org/vehicles/VehicleChangeStatusDialog';
import VehiclePhoto from '@/components/modules/org/vehicles/VehiclePhoto';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import type { VehicleStatus } from '@/lib/api/company-vehicle.types';
import {
  useCompanyVehicle,
  useDeleteCompanyVehicle,
  useUpdateCompanyVehicleStatus,
} from '@/lib/query/company-vehicle';
import {
  formatDriverName,
  formatFuelType,
  formatVehicleStatus,
  formatVehicleType,
  initialVehicleStatusChangeSelection,
  vehicleStatusVariant,
} from '@/lib/utils/company-vehicle-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
export default function VehicleDetailPageContent({
  vehicleId,
}: {
  vehicleId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const detailQuery = useCompanyVehicle(vehicleId);
  const deleteMutation = useDeleteCompanyVehicle();
  const statusMutation = useUpdateCompanyVehicleStatus(vehicleId);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<VehicleStatus | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const vehicle = detailQuery.data;

  async function handleStatusChange(): Promise<void> {
    if (!vehicle || !newStatus) {
      return;
    }
    try {
      await statusMutation.mutateAsync({ status: newStatus });
      messageApi.success(t('vehicles.statusUpdated'));
      setStatusModalOpen(false);
    } catch (error: unknown) {
      notifyApiError(error, t('vehicles.statusUpdateError'), messageApi);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!vehicle) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(vehicle.id);
      messageApi.success(t('vehicles.deleted', { plate: vehicle.plateNumber }));
      router.push('/organization/vehicles');
    } catch (error: unknown) {
      notifyApiError(error, t('vehicles.deleteError'), messageApi);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <div className={`flex flex-col ${DETAIL_PAGE_V2}`}>
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !vehicle) {
    return (
      <div className={`flex flex-col ${DETAIL_PAGE_V2}`}>
        <Alert
          type="error"
          showIcon
          title={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : t('vehicles.notFound')
          }
          action={
            <Button
              onClick={() => router.push('/organization/vehicles')}
            >
              {t('vehicles.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${DETAIL_PAGE_V2}`}>
      <VehicleChangeStatusDialog
        open={statusModalOpen}
        plateNumber={vehicle.plateNumber}
        currentStatus={vehicle.status}
        pendingStatus={newStatus}
        confirmLoading={statusMutation.isPending}
        onPendingStatusChange={setNewStatus}
        onConfirm={() => void handleStatusChange()}
        onCancel={() => {
          setStatusModalOpen(false);
          setNewStatus(undefined);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={t('vehicles.deleteTitle')}
        description={t('vehicles.deleteDescription', {
          plate: vehicle.plateNumber,
        })}
        confirmLabel={t('common.delete')}
        danger
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="text"
          icon={<ArrowLeft size={16} />}
          onClick={() => router.push('/organization/vehicles')}
        >
          {t('vehicles.backToList')}
        </Button>
        <Space wrap size={8} className="ml-auto">
          <Button
            onClick={() => {
              setNewStatus(initialVehicleStatusChangeSelection(vehicle.status));
              setStatusModalOpen(true);
            }}
          >
            {t('vehicles.changeStatus')}
          </Button>
          <Button
            danger
            onClick={() => setDeleteOpen(true)}
          >
            {t('common.delete')}
          </Button>
          <Button
            type="primary"
            icon={<Pencil size={14} />}
            onClick={() =>
              router.push(`/organization/vehicles/${vehicle.id}/edit`)
            }
          >
            {t('common.update')}
          </Button>
        </Space>
      </div>

      <div
        className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]"
      >
        <div className="flex flex-col gap-4 px-3 py-4 sm:flex-row sm:items-start sm:px-5">
          <VehiclePhoto
            vehicleId={vehicle.id}
            photoDocumentId={vehicle.photoDocumentId}
            plateNumber={vehicle.plateNumber}
            canEdit
            variant="hero"
            size={88}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CarFront size={16} style={{ color: tokens.colorPrimary }} />
              <span
                className="font-[family-name:var(--font-mono)] text-base font-semibold"
                style={{ color: tokens.colorTextPrimary }}
              >
                {vehicle.plateNumber}
              </span>
              <StatusBadge
                label={formatVehicleStatus(vehicle.status, t)}
                variant={vehicleStatusVariant(vehicle.status)}
              />
              <StatusBadge
                label={
                  vehicle.isActive ? t('common.active') : t('common.inactive')
                }
                variant={vehicle.isActive ? 'success' : 'default'}
              />
            </div>
            <p
              className="m-0 text-sm"
              style={{ color: tokens.colorTextSecondary }}
            >
              {vehicle.make} {vehicle.model} · {vehicle.year}
            </p>
          </div>
        </div>
      </div>

      <SummaryStrip
        items={[
          {
            label: t('vehicles.form.vehicleType'),
            value: formatVehicleType(vehicle.vehicleType, t),
            emphasize: true,
          },
          {
            label: t('hr.table.fuelType'),
            value: formatFuelType(vehicle.fuelType, t),
          },
          {
            label: t('hr.table.assignedDriver'),
            value: formatDriverName(vehicle.assignedDriver),
          },
          {
            label: t('vehicles.detail.registeredAt'),
            value: formatDisplayDateTime(vehicle.createdAt),
          },
        ]}
      />

      <SectionCard title={t('vehicles.steps.specifications')}>
        <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 sm:p-5">
          <MetaItem label={t('hr.table.plateNumber')}>
            <span className="font-[family-name:var(--font-mono)]">
              {vehicle.plateNumber}
            </span>
          </MetaItem>
          <MetaItem label={t('vehicles.form.vehicleType')}>
            {formatVehicleType(vehicle.vehicleType, t)}
          </MetaItem>
          <MetaItem label={t('hr.table.make')}>{vehicle.make}</MetaItem>
          <MetaItem label={t('hr.table.model')}>{vehicle.model}</MetaItem>
          <MetaItem label={t('hr.table.year')}>{vehicle.year}</MetaItem>
          <MetaItem label={t('vehicles.form.fuelType')}>
            {formatFuelType(vehicle.fuelType, t)}
          </MetaItem>
          <MetaItem label={t('vehicles.form.color')}>
            {vehicle.color?.trim() || '-'}
          </MetaItem>
          <MetaItem label={t('hr.table.status')}>
            <StatusBadge
              label={formatVehicleStatus(vehicle.status, t)}
              variant={vehicleStatusVariant(vehicle.status)}
            />
          </MetaItem>
        </div>
      </SectionCard>

      <SectionCard title={t('vehicles.steps.assignment')}>
        <div className="grid grid-cols-1 gap-4 p-3 sm:grid-cols-2 sm:p-5">
          <MetaItem label={t('hr.table.assignedDriver')}>
            {formatDriverName(vehicle.assignedDriver)}
          </MetaItem>
          <MetaItem label={t('vehicles.form.activeVehicle')}>
            {vehicle.isActive ? t('common.active') : t('common.inactive')}
          </MetaItem>
          <MetaItem label={t('vehicles.form.notes')}>
            {vehicle.notes?.trim() ? (
              <p className="m-0 whitespace-pre-wrap leading-relaxed">
                {vehicle.notes}
              </p>
            ) : (
              '-'
            )}
          </MetaItem>
        </div>
      </SectionCard>
    </div>
  );
}
