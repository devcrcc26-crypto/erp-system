import DeliverablesPageContent from '@/components/modules/projects/workspaces/DeliverablesPageContent';

export default async function ProjectDeliverablesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <DeliverablesPageContent projectId={projectId} />;
}
