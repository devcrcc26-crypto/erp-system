'use client';

import { useRouter } from 'next/navigation';
import ProjectSealForm from '@/components/modules/hr/project-seal/ProjectSealForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ProjectSealDetail } from '@/lib/api/project-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function ProjectSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: ProjectSealDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/project-seal/${created.id}`);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newProjectSeal')}
      description="Create a new project seal"
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <ProjectSealForm onSuccess={handleSuccess} />
    </HrFormPageShell>
  );
}
