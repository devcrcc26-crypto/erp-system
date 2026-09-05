'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import OfficialSealForm from '@/components/modules/hr/official-seal/OfficialSealForm';
import type { OfficialSealDetail } from '@/lib/api/official-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New official seal — title lives in MainContentHeader; page shows cancel + form.
 */
export default function OfficialSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: OfficialSealDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/official-seal/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-official-seal-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() => router.push('/hr/official-seal')}
          className="shrink-0"
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <OfficialSealForm onSuccess={handleSuccess} />
    </div>
  );
}
