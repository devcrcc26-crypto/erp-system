import FeatureComingSoon from '@/components/ui/FeatureComingSoon/FeatureComingSoon';
import EmployeePerDiemRatesDetailPageContent from '@/components/modules/hr/per-diem/EmployeePerDiemRatesDetailPageContent';
import { PER_DIEM_UI_ENABLED } from '@/lib/features/per-diem-ui';

export default async function EmployeePerDiemRatesDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}): Promise<React.ReactNode> {
  // TODO: re-enable when per diem rates are seeded
  if (!PER_DIEM_UI_ENABLED) {
    return <FeatureComingSoon moduleName="Per Diem" />;
  }
  const { employeeId } = await params;
  return <EmployeePerDiemRatesDetailPageContent employeeId={employeeId} />;
}
