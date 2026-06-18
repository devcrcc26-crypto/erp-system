import StatusBoardPageContent from '@/components/modules/projects/workspaces/StatusBoardPageContent';

export default async function ProjectStatusBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <StatusBoardPageContent projectId={projectId} />;
}
