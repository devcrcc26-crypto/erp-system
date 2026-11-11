'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddVehicleForm from '@/components/modules/org/vehicles/add-vehicle/AddVehicleForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCompanyVehicle } from '@/lib/query/company-vehicle';

const FORM_ROOT =
  'erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-company-vehicle-form-page flex flex-col gap-4';

export default function EditVehicleFormContent({
  vehicleId,
}: {
  vehicleId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const vehicleQuery = useCompanyVehicle(vehicleId);

  function handleSuccess(): void {
    const plate = vehicleQuery.data?.plateNumber ?? vehicleId;
    messageApi.success(t('vehicles.updated', { plate }));
    router.push(`/organization/vehicles/${vehicleId}`);
  }

  if (vehicleQuery.isLoading) {
    return (
      <div className={FORM_ROOT}>
        <div className="erp-pro-card p-6">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      </div>
    );
  }

  const vehicleSubtitle = vehicleQuery.data
    ? `${vehicleQuery.data.plateNumber} · ${vehicleQuery.data.make} ${vehicleQuery.data.model}`
    : t('vehicles.form.editDescription');

  return (
    <div className={FORM_ROOT}>
      <HrFormPageShell
        title={t('pages.organization.vehicles.edit')}
        description={vehicleSubtitle}
        cancelLabel={t('common.cancel')}
        cancelHref={`/organization/vehicles/${vehicleId}`}
        backLabel={t('hr.buttons.back')}
        showCancelButton={false}
      >
        <AddVehicleForm
          vehicleId={vehicleId}
          onSuccess={handleSuccess}
          onCancel={() => router.push(`/organization/vehicles/${vehicleId}`)}
          cancelLabel={t('common.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
