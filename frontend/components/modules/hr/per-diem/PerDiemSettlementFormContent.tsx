'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import PerDiemSettlementForm from '@/components/modules/hr/per-diem/PerDiemSettlementForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { PerDiemSettlementDetail } from '@/lib/api/per-diem.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New per diem settlement - shared HR form banner + stepper form.
 */
export default function PerDiemSettlementFormContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();

  function handleSuccess(created: PerDiemSettlementDetail): void {
    router.push(`/hr/per-diem/settlements/${created.id}`);
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-per-diem-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.perDiemSettlement.new')}
        description={t('pages.hr.perDiemSettlement.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <PerDiemSettlementForm
          onSuccess={handleSuccess}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
