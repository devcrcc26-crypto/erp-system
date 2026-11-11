import LeaveRequestEditPageContent from '@/components/modules/hr/leave/LeaveRequestEditPageContent';

export default async function LeaveRequestEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <LeaveRequestEditPageContent requestId={id} />;
}
