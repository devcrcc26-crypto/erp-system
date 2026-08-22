'use client';

import { useRouter } from 'next/navigation';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
    <HrFormPageShell
      title={t('hr.buttons.newVehicleRefueling')}
      description="Request fuel for a company vehicle. Attach the receipt after approval."
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <VehicleRefuelingForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
