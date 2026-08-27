'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New vehicle refueling page — same page chrome as Add Employee (`/users/new`).
 */
export default function VehicleRefuelingFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: VehicleRefuelingDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/vehicle-refueling/${created.id}`);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
            onClick={() => router.push('/hr/vehicle-refueling')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
      </div>
      <VehicleRefuelingForm onSuccess={handleSuccess} />
    </div>
  );
}
