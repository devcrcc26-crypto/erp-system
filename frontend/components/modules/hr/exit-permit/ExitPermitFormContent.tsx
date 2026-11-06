'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import ExitPermitForm from '@/components/modules/hr/exit-permit/ExitPermitForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ExitPermitDetail } from '@/lib/api/exit-permit.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { exitPermitKeys } from '@/lib/query/exit-permit';

/**
 * New exit permit - shared HR form banner + stepper form.
 */
export default function ExitPermitFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: ExitPermitDetail): Promise<void> {
    queryClient.setQueryData(exitPermitKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [exitPermitKeys.all, exitPermitKeys.detail(created.id)],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-exit-permit-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.exitPermit.new')}
        description={t('pages.hr.exitPermit.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <ExitPermitForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
