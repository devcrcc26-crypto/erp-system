'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import OfficialSealForm from '@/components/modules/hr/official-seal/OfficialSealForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { OfficialSealDetail } from '@/lib/api/official-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { officialSealKeys } from '@/lib/query/official-seal';

/**
 * New official seal usage request - shared HR form banner + stepper form.
 */
export default function OfficialSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: OfficialSealDetail): Promise<void> {
    queryClient.setQueryData(officialSealKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [
        officialSealKeys.all,
        officialSealKeys.detail(created.id),
      ],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-official-seal-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.officialSeal.new')}
        description={t('pages.hr.officialSeal.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <OfficialSealForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
