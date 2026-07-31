import LeaveRequestDetailPageContent from '@/components/modules/hr/leave/LeaveRequestDetailPageContent';

export default async function LeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <LeaveRequestDetailPageContent requestId={id} />;
}
