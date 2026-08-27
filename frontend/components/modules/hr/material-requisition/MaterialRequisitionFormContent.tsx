'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
import type { MaterialRequisitionDetail } from '@/lib/api/material-requisition.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import SectionPageHeader from '@/components/ui/SectionPageHeader/SectionPageHeader';

/**
 * New material requisition page — same page chrome as Add Employee (`/users/new`).
 */
export default function MaterialRequisitionFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: MaterialRequisitionDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/material-requisition/${created.id}`);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <SectionPageHeader
        title={t('pages.hr.materialRequisition.new')}
        description={t('pages.hr.materialRequisition.formDescription')}
        actions={
          <Button
            onClick={() => router.push('/hr/material-requisition')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
        }
      />
      <MaterialRequisitionForm onSuccess={handleSuccess} />
    </div>
  );
}
