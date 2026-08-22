'use client';

import { useRouter } from 'next/navigation';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { MaterialRequisitionDetail } from '@/lib/api/material-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Page wrapper for the new material requisition stepper form.
 */
export default function MaterialRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: MaterialRequisitionDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/material-requisition/${created.id}`);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newMaterialRequisition')}
      description="Complete all three steps to submit your material requisition for approval."
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <MaterialRequisitionForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
