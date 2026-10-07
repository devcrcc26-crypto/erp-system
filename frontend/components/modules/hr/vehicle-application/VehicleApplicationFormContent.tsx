'use client';

import { useRouter } from 'next/navigation';
import VehicleApplicationForm from '@/components/modules/hr/vehicle-application/VehicleApplicationForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { VehicleApplicationDetail } from '@/lib/api/vehicle-application.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New vehicle application — shared HR form banner + stepper form.
 */
export default function VehicleApplicationFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: VehicleApplicationDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/vehicle-applications/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-vehicle-application-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.vehicleApplication.new')}
        description={t('pages.hr.vehicleApplication.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <VehicleApplicationForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
