'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import ConsumablesRequisitionForm from '@/components/modules/hr/consumables/ConsumablesRequisitionForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ConsumablesRequisitionDetail } from '@/lib/api/consumables-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { consumablesRequisitionKeys } from '@/lib/query/consumables-requisition';

/**
 * New consumables requisition - shared HR form banner + stepper form.
 */
export default function ConsumablesRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: ConsumablesRequisitionDetail): Promise<void> {
    queryClient.setQueryData(
      consumablesRequisitionKeys.detail(created.id),
      created,
    );
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [
        consumablesRequisitionKeys.all,
        consumablesRequisitionKeys.detail(created.id),
      ],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-consumables-form-page">
      <HrFormPageShell
        title={t('pages.hr.consumables.new')}
        description={t('pages.hr.consumables.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <ConsumablesRequisitionForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
