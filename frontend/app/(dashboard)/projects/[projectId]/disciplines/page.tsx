import DisciplinesPageContent from '@/components/modules/projects/disciplines/DisciplinesPageContent';

export default async function ProjectDisciplinesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ taskId?: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  const { taskId } = await searchParams;
  return <DisciplinesPageContent projectId={projectId} taskId={taskId} />;
}
