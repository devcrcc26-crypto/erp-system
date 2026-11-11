import DisciplinesPageContent from '@/components/modules/projects/disciplines/DisciplinesPageContent';

export default async function ProjectDisciplinesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <DisciplinesPageContent projectId={projectId} />;
}
