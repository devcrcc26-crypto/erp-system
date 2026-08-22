'use client';

import { useRouter } from 'next/navigation';
import ConsumablesRequisitionForm from '@/components/modules/hr/consumables/ConsumablesRequisitionForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ConsumablesRequisitionDetail } from '@/lib/api/consumables-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Page wrapper for the new consumables requisition form.
 */
export default function ConsumablesRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: ConsumablesRequisitionDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/consumables/${created.id}`);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newConsumables')}
      description="Request low-value consumables (under ETB 5,000 per item) for HR Officer approval."
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <ConsumablesRequisitionForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
