'use client';

import { useRouter } from 'next/navigation';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New vehicle refueling request — shared HR form banner + stepper form.
 */
export default function VehicleRefuelingFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: VehicleRefuelingDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/vehicle-refueling/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-vehicle-refueling-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.vehicleRefueling.new')}
        description={t('pages.hr.vehicleRefueling.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <VehicleRefuelingForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
