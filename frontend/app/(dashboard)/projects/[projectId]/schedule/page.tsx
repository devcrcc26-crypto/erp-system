import SchedulePageContent from '@/components/modules/projects/schedule/SchedulePageContent';

export default async function ProjectSchedulePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <SchedulePageContent projectId={projectId} />;
}
