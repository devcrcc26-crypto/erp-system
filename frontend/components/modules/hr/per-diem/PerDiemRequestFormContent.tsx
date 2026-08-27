'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import PerDiemRequestForm from '@/components/modules/hr/per-diem/PerDiemRequestForm';
import type { PerDiemRequestDetail } from '@/lib/api/per-diem.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New per diem request page — same page chrome as Add Employee (`/users/new`).
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
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
            onClick={() => router.push('/hr/per-diem')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
      </div>
      <PerDiemRequestForm onSuccess={handleSuccess} />
    </div>
  );
}
