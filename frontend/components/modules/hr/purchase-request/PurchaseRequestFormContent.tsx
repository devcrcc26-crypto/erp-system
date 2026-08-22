'use client';

import { useRouter } from 'next/navigation';
import PurchaseRequestForm from '@/components/modules/hr/purchase-request/PurchaseRequestForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { PurchaseRequestDetail } from '@/lib/api/purchase-request.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Page wrapper for the new purchase request stepper form.
 * On success navigates to the approval request or the detail page.
 */
export default function PurchaseRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: PurchaseRequestDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/purchase-requests/${created.id}`);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newPurchaseRequest')}
      description="Complete all three steps to submit your purchase request for approval."
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <PurchaseRequestForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
