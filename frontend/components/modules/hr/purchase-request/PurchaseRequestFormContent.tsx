'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import PurchaseRequestForm from '@/components/modules/hr/purchase-request/PurchaseRequestForm';
import type { PurchaseRequestDetail } from '@/lib/api/purchase-request.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import SectionPageHeader from '@/components/ui/SectionPageHeader/SectionPageHeader';

/**
 * New purchase request page — same page chrome as Add Employee (`/users/new`).
 */
export default function PurchaseRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: PurchaseRequestDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/purchase-requests/${created.id}`);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <SectionPageHeader
        title={t('pages.hr.purchaseRequest.new')}
        description={t('pages.hr.purchaseRequest.formDescription')}
        actions={
          <Button
            onClick={() => router.push('/hr/purchase-requests')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
        }
      />
      <PurchaseRequestForm onSuccess={handleSuccess} />
    </div>
  );
}
