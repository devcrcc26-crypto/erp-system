'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useState } from 'react';
import { Button, Grid, Skeleton } from 'antd';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  MetaItem,
  SectionCard,
} from '@/components/modules/hr/shared/hr-page-chrome';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import VehicleChangeStatusDialog from '@/components/modules/org/vehicles/VehicleChangeStatusDialog';
import VehiclePhoto from '@/components/modules/org/vehicles/VehiclePhoto';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
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
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';

const DETAIL_ROOT = `erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page erp-company-vehicle-detail-page ${DETAIL_PAGE_V2}`;

export default function VehicleDetailPageContent({
  vehicleId,
}: {
  vehicleId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const screens = Grid.useBreakpoint();
  const isCompact = screens.md === false;
  const isNarrow = screens.sm === false;
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
      <div className={DETAIL_ROOT}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !vehicle) {
    return (
      <div
        className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-detail-page ${DETAIL_PAGE_V2}`}
      >
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            detailQuery.error,
            t('vehicles.notFound'),
            t,
          )}
          action={
            <Button onClick={() => router.push('/organization/vehicles')}>
              {t('vehicles.backToList')}
            </Button>
          }
        />
      </div>
    );
  }

  const backHref = '/organization/vehicles';
  const heroTitle = `${vehicle.make} ${vehicle.model}`.trim();
  const heroSubtitle = `${formatVehicleType(vehicle.vehicleType, t)} · ${formatFuelType(vehicle.fuelType, t)} · ${vehicle.year}`;

  return (
    <div className={DETAIL_ROOT}>
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
        className="erp-hr-travel-modal"
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

      <div className="erp-pro-card">
        <div className="erp-pro-card-toolbar erp-employee-toolbar">
          <div className="erp-employee-toolbar-back flex min-w-0 items-center gap-2">
            <Button
              type="text"
              icon={<ArrowLeft size={16} />}
              onClick={() => router.push(backHref)}
              aria-label={t('vehicles.backToList')}
            >
              {isNarrow ? undefined : t('vehicles.backToList')}
            </Button>
          </div>
          <div className="erp-employee-toolbar-actions flex flex-wrap items-center justify-end gap-2">
            <Button
              onClick={() => {
                setNewStatus(initialVehicleStatusChangeSelection(vehicle.status));
                setStatusModalOpen(true);
              }}
              aria-label={t('vehicles.changeStatus')}
            >
              {isCompact ? t('hr.table.status') : t('vehicles.changeStatus')}
            </Button>
            <Button
              danger
              icon={<Trash2 size={14} />}
              onClick={() => setDeleteOpen(true)}
              aria-label={t('common.delete')}
            >
              {isCompact ? undefined : t('common.delete')}
            </Button>
            <Button
              type="primary"
              icon={<Pencil size={14} />}
              onClick={() =>
                router.push(`/organization/vehicles/${vehicle.id}/edit`)
              }
              aria-label={t('common.update')}
            >
              {isCompact ? undefined : t('common.update')}
            </Button>
          </div>
        </div>

        <div className="erp-employee-hero erp-contract-hero">
          <VehiclePhoto
            vehicleId={vehicle.id}
            photoDocumentId={vehicle.photoDocumentId}
            plateNumber={vehicle.plateNumber}
            canEdit
            variant="hero"
            size={isCompact ? 72 : 88}
          />
          <div className="erp-employee-hero-copy min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="erp-users-id-chip font-[family-name:var(--font-mono)]">
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
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 sm:justify-start">
              <h2 className="erp-users-name erp-employee-hero-name m-0 break-words">
                {heroTitle}
              </h2>
            </div>
            <p className="erp-users-email m-0 mt-1.5 break-words sm:text-left">
              {heroSubtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="erp-users-stat-bar erp-employee-meta-bar erp-contract-meta-bar">
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.status')}</p>
            <p className="erp-employee-meta-value">
              <StatusBadge
                label={formatVehicleStatus(vehicle.status, t)}
                variant={vehicleStatusVariant(vehicle.status)}
              />
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">
              {t('vehicles.form.vehicleType')}
            </p>
            <p className="erp-employee-meta-value truncate">
              {formatVehicleType(vehicle.vehicleType, t)}
            </p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.year')}</p>
            <p className="erp-employee-meta-value">{vehicle.year}</p>
          </div>
        </div>
        <div className="erp-users-stat">
          <div className="min-w-0">
            <p className="erp-users-stat-label">{t('hr.table.assignedDriver')}</p>
            <p className="erp-employee-meta-value truncate">
              {formatDriverName(vehicle.assignedDriver)}
            </p>
          </div>
        </div>
      </div>

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
          <MetaItem label={t('vehicles.detail.registeredAt')}>
            {formatDisplayDateTime(vehicle.createdAt)}
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
