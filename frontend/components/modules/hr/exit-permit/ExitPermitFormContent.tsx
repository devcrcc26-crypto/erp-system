'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import ExitPermitForm from '@/components/modules/hr/exit-permit/ExitPermitForm';
import type { ExitPermitDetail } from '@/lib/api/exit-permit.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

const EXIT_PERMIT_LIST_PATH = '/hr/equipment-and-materials-exit-permit';

/**
 * New exit permit — title lives in MainContentHeader; page shows cancel + form.
 */
export default function ExitPermitFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: ExitPermitDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`${EXIT_PERMIT_LIST_PATH}/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-exit-permit-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() => router.push(EXIT_PERMIT_LIST_PATH)}
          className="shrink-0"
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <ExitPermitForm onSuccess={handleSuccess} />
    </div>
  );
}
