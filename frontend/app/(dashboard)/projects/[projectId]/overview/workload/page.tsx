import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function ProjectWorkloadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Dispatcher Workload"
      description="Assigned review sessions, open comments, and SLA overdue counts per team member."
    />
  );
}
