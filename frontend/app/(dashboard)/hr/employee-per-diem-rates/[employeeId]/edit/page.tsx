import EmployeePerDiemRatesEditPageContent from '@/components/modules/hr/per-diem/EmployeePerDiemRatesEditPageContent';

export default async function EmployeePerDiemRatesEditPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}): Promise<React.ReactNode> {
  const { employeeId } = await params;
  return <EmployeePerDiemRatesEditPageContent employeeId={employeeId} />;
}

