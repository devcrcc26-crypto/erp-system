import EpcWorkspacePlaceholder from '@/components/modules/projects/workspaces/EpcWorkspacePlaceholder';

export default async function ProjectDeliverablesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  await params;
  return (
    <EpcWorkspacePlaceholder
      title="Deliverables"
      description="Deliverables grouped by status will appear here once engineering packages are connected."
    />
  );
}
