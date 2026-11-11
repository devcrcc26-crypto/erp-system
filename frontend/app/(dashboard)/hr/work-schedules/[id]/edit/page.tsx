import WorkScheduleFormPageContent from '@/components/modules/hr/work-schedule/WorkScheduleFormPageContent';

export default async function EditWorkSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <WorkScheduleFormPageContent scheduleId={id} />;
}
