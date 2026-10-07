'use client';

import { Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddVehicleForm from '@/components/modules/org/vehicles/add-vehicle/AddVehicleForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCompanyVehicle } from '@/lib/query/company-vehicle';

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
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  const vehicleSubtitle = vehicleQuery.data
    ? `${vehicleQuery.data.plateNumber} · ${vehicleQuery.data.make} ${vehicleQuery.data.model}`
    : t('vehicles.form.editDescription');

  return (
    <HrFormPageShell
      title={t('pages.organization.vehicles.edit')}
      description={vehicleSubtitle}
      cancelLabel={t('common.cancel')}
      cancelHref={`/organization/vehicles/${vehicleId}`}
      backLabel={t('hr.buttons.back')}
    >
      <AddVehicleForm vehicleId={vehicleId} onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
