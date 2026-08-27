'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import ConsumablesRequisitionForm from '@/components/modules/hr/consumables/ConsumablesRequisitionForm';
import type { ConsumablesRequisitionDetail } from '@/lib/api/consumables-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { tokens } from '@/lib/theme/tokens';

/**
 * New consumables requisition page — same page chrome as Add Employee (`/users/new`).
 */
export default function ConsumablesRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: ConsumablesRequisitionDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/consumables/${created.id}`);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className="m-0 text-xl font-semibold tracking-tight"
            style={{
              color: tokens.colorTextPrimary,
              fontFamily: tokens.fontFamily,
            }}
          >
            {t('pages.hr.consumables.new')}
          </h1>
          <p
            className="mb-0 mt-1 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            {t('pages.hr.consumables.formDescription')}
          </p>
        </div>
        <Button
          onClick={() => router.push('/hr/consumables')}
          className="shrink-0"
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <ConsumablesRequisitionForm onSuccess={handleSuccess} />
    </div>
  );
}
