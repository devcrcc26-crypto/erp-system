'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import InspectionRepairForm from '@/components/modules/hr/inspection-repair/InspectionRepairForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { InspectionRepairDetail } from '@/lib/api/inspection-repair.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { inspectionRepairKeys } from '@/lib/query/inspection-repair';

/**
 * New inspection & repair request - shared HR form banner + stepper form.
 */
export default function InspectionRepairFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: InspectionRepairDetail): Promise<void> {
    queryClient.setQueryData(inspectionRepairKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [
        inspectionRepairKeys.all,
        inspectionRepairKeys.detail(created.id),
      ],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-inspection-repair-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.inspectionRepair.new')}
        description={t('pages.hr.inspectionRepair.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <InspectionRepairForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}