'use client';

import DispatcherWorkloadTable from '@/components/modules/projects/workspaces/DispatcherWorkloadTable';

export default function WorkloadPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return <DispatcherWorkloadTable projectId={projectId} />;
}
