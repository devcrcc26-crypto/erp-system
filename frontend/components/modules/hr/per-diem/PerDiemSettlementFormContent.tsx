'use client';

import { useRouter } from 'next/navigation';
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-per-diem-form-page">
      <HrFormPageShell
        title={t('pages.hr.perDiemSettlement.new')}
        description={t('pages.hr.perDiemSettlement.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <PerDiemSettlementForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
