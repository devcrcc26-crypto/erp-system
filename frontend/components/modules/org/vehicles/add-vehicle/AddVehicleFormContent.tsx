'use client';

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
    <HrFormPageShell
      title={t('pages.organization.vehicles.new')}
      description={t('vehicles.form.addDescription')}
      cancelLabel={t('common.cancel')}
      cancelHref="/organization/vehicles"
      backLabel={t('vehicles.backToList')}
    >
      <AddVehicleForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
