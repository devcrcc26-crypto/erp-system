'use client';

import { useRouter } from 'next/navigation';
import { Button } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import VehicleApplicationForm from '@/components/modules/hr/vehicle-application/VehicleApplicationForm';
import type { VehicleApplicationDetail } from '@/lib/api/vehicle-application.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

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
    <FormLayout
      title={t('hr.buttons.newVehicleApplication')}
      description="Request a company vehicle for business travel. Select dates first to check availability."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>
          {t('hr.buttons.cancel')}
        </Button>
      }
    >
      <VehicleApplicationForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
