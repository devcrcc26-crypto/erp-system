import DailyLogDetailPageContent from '@/components/modules/projects/daily-logs/DailyLogDetailPageContent';

export default async function DailyLogDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; logId: string }>;
}): Promise<React.ReactNode> {
  const { projectId, logId } = await params;
  return <DailyLogDetailPageContent projectId={projectId} logId={logId} />;
}
