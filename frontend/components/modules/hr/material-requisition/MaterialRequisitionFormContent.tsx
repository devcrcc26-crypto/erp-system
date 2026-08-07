'use client';

import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { Button } from 'antd';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
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
    <FormLayout
      title={t('hr.buttons.newMaterialRequisition')}
      description="Complete all three steps to submit your material requisition for approval."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>
          {t('hr.buttons.cancel')}
        </Button>
      }
    >
      <MaterialRequisitionForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
