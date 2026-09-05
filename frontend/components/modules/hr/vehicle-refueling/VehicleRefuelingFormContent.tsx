'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import VehicleRefuelingForm from '@/components/modules/hr/vehicle-refueling/VehicleRefuelingForm';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New vehicle refueling — title lives in MainContentHeader; page shows cancel + form.
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-vehicle-refueling-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() => router.push('/hr/vehicle-refueling')}
          className="shrink-0"
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <VehicleRefuelingForm onSuccess={handleSuccess} />
    </div>
  );
}
