'use client';

import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { Button } from 'antd';
import ConsumablesRequisitionForm from '@/components/modules/hr/consumables/ConsumablesRequisitionForm';
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
    <FormLayout
      title={t('hr.buttons.newConsumables')}
      description="Request low-value consumables (under ETB 5,000 per item) for HR Officer approval."
      extra={
        <Button onClick={() => router.push('/approvals/new')}>
          {t('hr.buttons.cancel')}
        </Button>
      }
    >
      <ConsumablesRequisitionForm onSuccess={handleSuccess} />
    </FormLayout>
  );
}
