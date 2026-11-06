'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { vehicleRefuelingKeys } from '@/lib/query/vehicle-refueling';

/**
 * New vehicle refueling request - shared HR form banner + stepper form.
 */
export default function VehicleRefuelingFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: VehicleRefuelingDetail): Promise<void> {
    queryClient.setQueryData(vehicleRefuelingKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [
        vehicleRefuelingKeys.all,
        vehicleRefuelingKeys.detail(created.id),
      ],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-vehicle-refueling-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.vehicleRefueling.new')}
        description={t('pages.hr.vehicleRefueling.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <VehicleRefuelingForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
