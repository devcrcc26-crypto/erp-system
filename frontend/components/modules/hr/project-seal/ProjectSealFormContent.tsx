'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import ProjectSealForm from '@/components/modules/hr/project-seal/ProjectSealForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { ProjectSealDetail } from '@/lib/api/project-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { projectSealKeys } from '@/lib/query/project-seal';

/**
 * New project seal usage request - shared HR form banner + stepper form.
 */
export default function ProjectSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: ProjectSealDetail): Promise<void> {
    queryClient.setQueryData(projectSealKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [projectSealKeys.all, projectSealKeys.detail(created.id)],
    });
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-project-seal-form-page flex flex-col gap-4">
      <HrFormPageShell
        title={t('pages.hr.projectSeal.new')}
        description={t('pages.hr.projectSeal.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <ProjectSealForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
