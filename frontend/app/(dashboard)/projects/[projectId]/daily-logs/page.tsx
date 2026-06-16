import DailyLogsPageContent from '@/components/modules/projects/daily-logs/DailyLogsPageContent';

export default async function ProjectDailyLogsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<React.ReactNode> {
  const { projectId } = await params;
  return <DailyLogsPageContent projectId={projectId} />;
}
