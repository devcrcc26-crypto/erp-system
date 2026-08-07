'use client';

import { useRouter } from 'next/navigation';
import { Button } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
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
    <FormLayout
      title={t('hr.buttons.newVehicleRefueling')}
      description="Request fuel for a company vehicle. Attach the receipt after approval."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>
          {t('hr.buttons.cancel')}
        </Button>
      }
    >
      <VehicleRefuelingForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
