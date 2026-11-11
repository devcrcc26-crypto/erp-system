import ProjectDashboard from '@/components/modules/projects/ProjectDashboard';

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ProjectDashboard projectId={projectId} />;
}
