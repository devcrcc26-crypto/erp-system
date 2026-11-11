import TasksListPageContent from '@/components/modules/projects/schedule/TasksListPageContent';

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <TasksListPageContent projectId={projectId} />;
}
