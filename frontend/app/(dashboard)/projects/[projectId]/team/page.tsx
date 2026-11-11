import ProjectTeamPanel from '@/components/modules/projects/ProjectTeamPanel';

export default async function ProjectTeamPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ProjectTeamPanel projectId={projectId} />;
}
