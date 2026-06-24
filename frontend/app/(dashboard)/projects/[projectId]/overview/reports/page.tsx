import ProjectReportsPageContent from '@/components/modules/projects/workspaces/ProjectReportsPageContent';

export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ProjectReportsPageContent projectId={projectId} />;
}
