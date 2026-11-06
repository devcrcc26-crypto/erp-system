'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { MaterialRequisitionDetail } from '@/lib/api/material-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { materialRequisitionKeys } from '@/lib/query/material-requisition';

/**
 * New material requisition - shared HR form banner + stepper form.
 */
export default function MaterialRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: MaterialRequisitionDetail): Promise<void> {
    queryClient.setQueryData(materialRequisitionKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [
        materialRequisitionKeys.all,
        materialRequisitionKeys.detail(created.id),
      ],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-material-requisition-form-page">
      <HrFormPageShell
        title={t('pages.hr.materialRequisition.new')}
        description={t('pages.hr.materialRequisition.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <MaterialRequisitionForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
