'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectStatusBoard from '@/components/modules/projects/workspaces/ProjectStatusBoard';

export default function StatusBoardPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return <ProjectStatusBoard projectId={projectId} />;
}
