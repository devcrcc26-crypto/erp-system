import OvertimeHistoryPageContent from '@/components/modules/hr/overtime/OvertimeHistoryPageContent';

export default async function EmployeeOvertimeHistoryPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}): Promise<React.ReactNode> {
  const { employeeId } = await params;
  return (
    <OvertimeHistoryPageContent mode="employee" employeeId={employeeId} />
  );
}
