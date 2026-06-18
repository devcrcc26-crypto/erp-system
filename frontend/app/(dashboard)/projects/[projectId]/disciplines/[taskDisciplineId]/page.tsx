import DisciplineDetailPageContent from '@/components/modules/projects/disciplines/DisciplineDetailPageContent';

export default async function TaskDisciplineDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskDisciplineId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, taskDisciplineId } = await params;
  return (
    <DisciplineDetailPageContent
      projectId={projectId}
      taskDisciplineId={taskDisciplineId}
    />
  );
}
