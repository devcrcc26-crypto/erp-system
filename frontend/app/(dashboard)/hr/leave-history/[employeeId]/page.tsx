import LeaveHistoryPageContent from '@/components/modules/hr/leave/LeaveHistoryPageContent';

export default async function EmployeeLeaveHistoryPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}): Promise<React.ReactNode> {
  const { employeeId } = await params;
  return (
    <LeaveHistoryPageContent mode="employee" employeeId={employeeId} />
  );
}
