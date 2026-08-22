'use client';

import { useRouter } from 'next/navigation';
import OfficialSealForm from '@/components/modules/hr/official-seal/OfficialSealForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { OfficialSealDetail } from '@/lib/api/official-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function OfficialSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: OfficialSealDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/official-seal/${created.id}`);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newOfficialSeal')}
      description="Create a new official seal"
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <OfficialSealForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
