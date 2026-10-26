'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import OfficialSealForm from '@/components/modules/hr/official-seal/OfficialSealForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { OfficialSealDetail } from '@/lib/api/official-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New official seal usage request - shared HR form banner + stepper form.
 */
export default function OfficialSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: OfficialSealDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/official-seal/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-official-seal-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.officialSeal.new')}
        description={t('pages.hr.officialSeal.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <OfficialSealForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
