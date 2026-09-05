'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import VehicleApplicationForm from '@/components/modules/hr/vehicle-application/VehicleApplicationForm';
import type { VehicleApplicationDetail } from '@/lib/api/vehicle-application.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New vehicle application — title lives in MainContentHeader; page shows cancel + form.
 */
export default function VehicleApplicationFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: VehicleApplicationDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/vehicle-applications/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-vehicle-application-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() => router.push('/hr/vehicle-applications')}
          className="shrink-0"
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <VehicleApplicationForm onSuccess={handleSuccess} />
    </div>
  );
}
