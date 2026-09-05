'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import InspectionRepairForm from '@/components/modules/hr/inspection-repair/InspectionRepairForm';
import type { InspectionRepairDetail } from '@/lib/api/inspection-repair.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New inspection & repair — title in MainContentHeader; page shows cancel + form.
 */
export default function InspectionRepairFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: InspectionRepairDetail): void {
    if (created.approvalRequest?.id) {
      router.push(`/approvals/${created.approvalRequest.id}`);
    } else {
      router.push(`/hr/inspection-repair/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-inspection-repair-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() => router.push('/hr/inspection-repair')}
          className="shrink-0"
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <InspectionRepairForm onSuccess={handleSuccess} />
    </div>
  );
}
