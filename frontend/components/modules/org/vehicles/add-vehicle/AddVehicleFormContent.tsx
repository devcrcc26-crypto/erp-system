'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import AddVehicleForm from '@/components/modules/org/vehicles/add-vehicle/AddVehicleForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';

export default function AddVehicleFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();

  function handleSuccess(): void {
    messageApi.success(t('vehicles.created'));
    router.push('/organization/vehicles');
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-company-vehicle-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.organization.vehicles.new')}
        description={t('vehicles.form.addDescription')}
        cancelLabel={t('common.cancel')}
        cancelHref="/organization/vehicles"
        backLabel={t('vehicles.backToList')}
        showCancelButton={false}
      >
        <AddVehicleForm
          onSuccess={handleSuccess}
          onCancel={() => router.push('/organization/vehicles')}
          cancelLabel={t('common.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
