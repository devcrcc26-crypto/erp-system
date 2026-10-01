'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import PerDiemSettlementForm from '@/components/modules/hr/per-diem/PerDiemSettlementForm';
import type { PerDiemSettlementDetail } from '@/lib/api/per-diem.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New per diem settlement page shell.
 */
export default function PerDiemSettlementFormContent(): React.ReactNode {
  const router = useRouter();
  const { t } = useEpcTranslation();

  useSetHeaderExtra(null);

  function handleSuccess(created: PerDiemSettlementDetail): void {
    router.push(`/hr/per-diem/settlements/${created.id}`);
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-per-diem-form-page">
      <div className="erp-per-diem-form-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button onClick={() => router.push('/approvals/new')} className="shrink-0">
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <PerDiemSettlementForm onSuccess={handleSuccess} />
    </div>
  );
}
