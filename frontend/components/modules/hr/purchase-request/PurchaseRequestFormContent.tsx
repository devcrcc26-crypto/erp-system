'use client';

import { useRouter } from 'next/navigation';
import PurchaseRequestForm from '@/components/modules/hr/purchase-request/PurchaseRequestForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { PurchaseRequestDetail } from '@/lib/api/purchase-request.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New purchase request — shared HR form banner + stepper form.
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-purchase-request-form-page">
      <HrFormPageShell
        title={t('pages.hr.purchaseRequest.new')}
        description={t('pages.hr.purchaseRequest.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <PurchaseRequestForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
