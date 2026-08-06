'use client';

import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { Button } from 'antd';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
import type { MaterialRequisitionDetail } from '@/lib/api/material-requisition.types';

/**
 * Page wrapper for the new material requisition stepper form.
 */
export default function MaterialRequisitionFormContent(): React.ReactNode {
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
      title="New Material Requisition"
      description="Complete all three steps to submit your material requisition for approval."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
      }
    >
      <MaterialRequisitionForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
