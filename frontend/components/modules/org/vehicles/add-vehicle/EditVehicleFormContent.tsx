'use client';

import { useMemo } from 'react';
import { Button, Skeleton } from 'antd';
import { useRouter } from 'next/navigation';
import AddVehicleForm from '@/components/modules/org/vehicles/add-vehicle/AddVehicleForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { useCompanyVehicle } from '@/lib/query/company-vehicle';
import { tokens } from '@/lib/theme/tokens';

export default function EditVehicleFormContent({
  vehicleId,
}: {
  vehicleId: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const vehicleQuery = useCompanyVehicle(vehicleId);

  const headerExtra = useMemo(
    () => (
      <Button
        onClick={() => router.push(`/organization/vehicles/${vehicleId}`)}
        style={{ borderRadius: 0 }}
      >
        {t('common.cancel')}
      </Button>
    ),
    [router, t, vehicleId],
  );
  useSetHeaderExtra(headerExtra);

  function handleSuccess(): void {
    const plate = vehicleQuery.data?.plateNumber ?? vehicleId;
    messageApi.success(t('vehicles.updated', { plate }));
    router.push(`/organization/vehicles/${vehicleId}`);
  }

  if (vehicleQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <p
        className="mb-4 mt-0 text-[14px] leading-relaxed"
        style={{ color: tokens.colorTextSecondary, fontFamily: tokens.fontFamily }}
      >
        {vehicleQuery.data
          ? `${vehicleQuery.data.plateNumber} · ${vehicleQuery.data.make} ${vehicleQuery.data.model}`
          : t('vehicles.form.editDescription')}
      </p>
      <AddVehicleForm vehicleId={vehicleId} onSuccess={handleSuccess} />
    </div>
  );
}
