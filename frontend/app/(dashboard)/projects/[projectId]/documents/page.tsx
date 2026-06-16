import ProjectDocumentsPanel from '@/components/modules/projects/ProjectDocumentsPanel';

export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <ProjectDocumentsPanel projectId={projectId} />;
}
