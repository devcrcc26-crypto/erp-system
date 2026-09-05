'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import VehicleApplicationForm from '@/components/modules/hr/vehicle-application/VehicleApplicationForm';
import type { VehicleApplicationDetail } from '@/lib/api/vehicle-application.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New vehicle application — same page chrome as Add Employee / Consumables.
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-vehicle-application-form-page">
      <div className="erp-pro-card overflow-hidden">
        <div className="erp-pro-card-toolbar erp-vehicle-application-form-actions !border-b-0">
          <div className="min-w-0 flex-1">
            <h2 className="erp-pro-card-toolbar-title">
              {t('pages.hr.vehicleApplication.new')}
            </h2>
            <p className="m-0 mt-1 text-[13px] leading-snug text-[#6B7280]">
              {t('pages.hr.vehicleApplication.formDescription')}
            </p>
          </div>
          <Button
            onClick={() => router.push('/approvals/new')}
            className="shrink-0"
          >
            {t('hr.buttons.cancel')}
          </Button>
        </div>
      </div>
      <VehicleApplicationForm onSuccess={handleSuccess} />
    </div>
  );
}
