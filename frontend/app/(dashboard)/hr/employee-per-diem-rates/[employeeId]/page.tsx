import EmployeePerDiemRatesDetailPageContent from '@/components/modules/hr/per-diem/EmployeePerDiemRatesDetailPageContent';

export default async function EmployeePerDiemRatesDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}): Promise<React.ReactNode> {
  const { employeeId } = await params;
  return <EmployeePerDiemRatesDetailPageContent employeeId={employeeId} />;
}

