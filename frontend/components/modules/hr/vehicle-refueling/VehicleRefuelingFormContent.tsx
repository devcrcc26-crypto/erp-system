'use client';

import { useRouter } from 'next/navigation';
import { Button } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';

export default function VehicleRefuelingFormContent(): React.ReactNode {
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
      title="New Vehicle Refueling Request"
      description="Request fuel for a company vehicle. Attach the receipt after approval."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
      }
    >
      <VehicleRefuelingForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
