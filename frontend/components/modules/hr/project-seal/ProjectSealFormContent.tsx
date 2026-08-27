'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import ProjectSealForm from '@/components/modules/hr/project-seal/ProjectSealForm';
import type { ProjectSealDetail } from '@/lib/api/project-seal.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New project seal page — same page chrome as Add Employee (`/users/new`).
 */
export default function ProjectSealFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: ProjectSealDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/project-seal/${created.id}`);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end gap-2">
        <Button
            onClick={() => router.push('/hr/project-seal')}
            className="shrink-0"
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.cancel')}
          </Button>
      </div>
      <ProjectSealForm onSuccess={handleSuccess} />
    </div>
  );
}
