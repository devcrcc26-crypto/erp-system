'use client';

import { useRouter } from 'next/navigation';
import ConsumablesRequisitionForm from '@/components/modules/hr/consumables/ConsumablesRequisitionForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ConsumablesRequisitionDetail } from '@/lib/api/consumables-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New consumables requisition - shared HR form banner + stepper form.
 */
export default function ConsumablesRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: ConsumablesRequisitionDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/consumables-requisitions/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-consumables-form-page">
      <HrFormPageShell
        title={t('pages.hr.consumables.new')}
        description={t('pages.hr.consumables.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <ConsumablesRequisitionForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
