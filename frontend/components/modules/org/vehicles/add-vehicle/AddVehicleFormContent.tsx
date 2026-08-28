'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import AddVehicleForm from '@/components/modules/org/vehicles/add-vehicle/AddVehicleForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

export default function AddVehicleFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();

  useSetHeaderExtra(null);

  function handleSuccess(): void {
    messageApi.success(t('vehicles.created'));
    router.push('/organization/vehicles');
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          onClick={() => router.push('/organization/vehicles')}
          className="shrink-0"
          style={{ borderRadius: 0 }}
        >
          {t('common.cancel')}
        </Button>
      </div>
      <AddVehicleForm onSuccess={handleSuccess} />
    </div>
  );
}
