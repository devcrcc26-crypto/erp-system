'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import EpcWorkspacePanels from '@/components/modules/projects/workspaces/EpcWorkspacePanels';
import ProjectStatusBoard from '@/components/modules/projects/workspaces/ProjectStatusBoard';

export default function StatusBoardPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <ProjectStatusBoard projectId={projectId} />
      <FormLayout title="EPC workspace">
        <EpcWorkspacePanels projectId={projectId} />
      </FormLayout>
    </div>
  );
}
