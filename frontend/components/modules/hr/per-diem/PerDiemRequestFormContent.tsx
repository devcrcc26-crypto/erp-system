'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import PerDiemRequestForm from '@/components/modules/hr/per-diem/PerDiemRequestForm';
import type { PerDiemRequestDetail } from '@/lib/api/per-diem.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New per diem request — same page chrome as Add Employee / Flight Application.
 */
export default function PerDiemRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: PerDiemRequestDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/per-diem/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-per-diem-form-page">
      <div className="erp-per-diem-form-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          onClick={() => router.push('/approvals/new')}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <PerDiemRequestForm onSuccess={handleSuccess} />
    </div>
  );
}
