import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function ProjectStatusBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Status Board"
      description="Package and discipline KPIs, active reviews, and bottleneck metrics will appear here."
    />
  );
}
