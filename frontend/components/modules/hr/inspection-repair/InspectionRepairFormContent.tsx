'use client';

import { useRouter } from 'next/navigation';
import InspectionRepairForm from '@/components/modules/hr/inspection-repair/InspectionRepairForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { InspectionRepairDetail } from '@/lib/api/inspection-repair.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New inspection & repair request — shared HR form banner + stepper form.
 */
export default function InspectionRepairFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: InspectionRepairDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/inspection-repair/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-inspection-repair-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.inspectionRepair.new')}
        description={t('pages.hr.inspectionRepair.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <InspectionRepairForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
