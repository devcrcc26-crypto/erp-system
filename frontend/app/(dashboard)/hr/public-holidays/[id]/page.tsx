import PublicHolidayDetailPageContent from '@/components/modules/hr/work-schedule/PublicHolidayDetailPageContent';

export default async function PublicHolidayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PublicHolidayDetailPageContent holidayId={id} />;
}
