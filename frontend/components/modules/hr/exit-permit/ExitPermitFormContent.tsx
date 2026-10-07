'use client';

import { useRouter } from 'next/navigation';
import ExitPermitForm from '@/components/modules/hr/exit-permit/ExitPermitForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ExitPermitDetail } from '@/lib/api/exit-permit.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const EXIT_PERMIT_LIST_PATH = '/hr/equipment-and-materials-exit-permit';

/**
 * New exit permit — shared HR form banner + stepper form.
 */
export default function ExitPermitFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: ExitPermitDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`${EXIT_PERMIT_LIST_PATH}/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-exit-permit-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.exitPermit.new')}
        description={t('pages.hr.exitPermit.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <ExitPermitForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
