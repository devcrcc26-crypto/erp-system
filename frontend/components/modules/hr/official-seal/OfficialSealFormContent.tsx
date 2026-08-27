'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import OfficialSealForm from '@/components/modules/hr/official-seal/OfficialSealForm';
import type { OfficialSealDetail } from '@/lib/api/official-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import SectionPageHeader from '@/components/ui/SectionPageHeader/SectionPageHeader';

/**
 * New official seal page — same page chrome as Add Employee (`/users/new`).
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
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <SectionPageHeader
        title={t('pages.hr.officialSeal.new')}
        description={t('pages.hr.officialSeal.formDescription')}
        actions={
          <Button
            onClick={() => router.push('/hr/official-seal')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
        }
      />
      <OfficialSealForm onSuccess={handleSuccess} />
    </div>
  );
}
