'use client';

import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { Button } from 'antd';
import PurchaseRequestForm from '@/components/modules/hr/purchase-request/PurchaseRequestForm';
import type { PurchaseRequestDetail } from '@/lib/api/purchase-request.types';

/**
 * Page wrapper for the new purchase request stepper form.
 * On success navigates to the approval request or the detail page.
 */
export default function PurchaseRequestFormContent(): React.ReactNode {
  const router = useRouter();

  function handleSuccess(created: PurchaseRequestDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/purchase-requests/${created.id}`);
    }
  }

  return (
    <FormLayout
      title="New Purchase Request"
      description="Complete all three steps to submit your purchase request for approval."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
      }
    >
      <PurchaseRequestForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
