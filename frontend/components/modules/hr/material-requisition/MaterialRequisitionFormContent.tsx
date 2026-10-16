'use client';

import { useRouter } from 'next/navigation';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { MaterialRequisitionDetail } from '@/lib/api/material-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New material requisition - shared HR form banner + stepper form.
 */
export default function MaterialRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: MaterialRequisitionDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/material-requisitions/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-material-requisition-form-page">
      <HrFormPageShell
        title={t('pages.hr.materialRequisition.new')}
        description={t('pages.hr.materialRequisition.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <MaterialRequisitionForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
