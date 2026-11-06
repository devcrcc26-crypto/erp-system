'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import VehicleApplicationForm from '@/components/modules/hr/vehicle-application/VehicleApplicationForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { VehicleApplicationDetail } from '@/lib/api/vehicle-application.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { vehicleApplicationKeys } from '@/lib/query/vehicle-application';

/**
 * New vehicle application - shared HR form banner + stepper form.
 */
export default function VehicleApplicationFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: VehicleApplicationDetail): Promise<void> {
    queryClient.setQueryData(vehicleApplicationKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [
        vehicleApplicationKeys.all,
        vehicleApplicationKeys.detail(created.id),
      ],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-vehicle-application-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.vehicleApplication.new')}
        description={t('pages.hr.vehicleApplication.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <VehicleApplicationForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
