import PublicHolidayFormPageContent from '@/components/modules/hr/work-schedule/PublicHolidayFormPageContent';

export default async function EditPublicHolidayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PublicHolidayFormPageContent holidayId={id} />;
}
