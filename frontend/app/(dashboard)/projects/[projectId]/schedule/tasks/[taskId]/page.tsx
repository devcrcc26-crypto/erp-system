import TaskDetailPageContent from '@/components/modules/projects/schedule/TaskDetailPageContent';

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, taskId } = await params;
  return <TaskDetailPageContent projectId={projectId} taskId={taskId} />;
}
