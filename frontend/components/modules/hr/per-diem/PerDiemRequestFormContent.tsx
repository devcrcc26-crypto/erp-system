'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import PerDiemRequestForm from '@/components/modules/hr/per-diem/PerDiemRequestForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { PerDiemRequestDetail } from '@/lib/api/per-diem.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New per diem request - shared HR form banner + stepper form.
 */
export default function PerDiemRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: PerDiemRequestDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/per-diem/${created.id}`);
    }
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-per-diem-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.perDiem.new')}
        description={t('pages.hr.perDiem.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <PerDiemRequestForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
