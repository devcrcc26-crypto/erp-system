'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import ProjectSealForm from '@/components/modules/hr/project-seal/ProjectSealForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ProjectSealDetail } from '@/lib/api/project-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New project seal usage request - shared HR form banner + stepper form.
 */
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
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-project-seal-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.projectSeal.new')}
        description={t('pages.hr.projectSeal.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <ProjectSealForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
