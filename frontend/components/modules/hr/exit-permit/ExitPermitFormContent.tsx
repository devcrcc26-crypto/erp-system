'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import ExitPermitForm from '@/components/modules/hr/exit-permit/ExitPermitForm';
import type { ExitPermitDetail } from '@/lib/api/exit-permit.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

const EXIT_PERMIT_LIST_PATH = '/hr/equipment-and-materials-exit-permit';

/**
 * New exit permit page - same page chrome as Add Employee (`/users/new`).
 */
export default function ExitPermitFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: ExitPermitDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(EXIT_PERMIT_LIST_PATH);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
          onClick={() => router.push(EXIT_PERMIT_LIST_PATH)}
          className="shrink-0"
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <ExitPermitForm onSuccess={handleSuccess} />
    </div>
  );
}
