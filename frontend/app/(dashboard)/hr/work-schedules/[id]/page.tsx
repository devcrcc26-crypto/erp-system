import WorkScheduleDetailPageContent from '@/components/modules/hr/work-schedule/WorkScheduleDetailPageContent';

export default async function WorkScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <WorkScheduleDetailPageContent scheduleId={id} />;
}
