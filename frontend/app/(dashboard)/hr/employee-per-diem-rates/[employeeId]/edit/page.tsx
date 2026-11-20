import FeatureComingSoon from '@/components/ui/FeatureComingSoon/FeatureComingSoon';
import EmployeePerDiemRatesEditPageContent from '@/components/modules/hr/per-diem/EmployeePerDiemRatesEditPageContent';
import { PER_DIEM_UI_ENABLED } from '@/lib/features/per-diem-ui';

export default async function EmployeePerDiemRatesEditPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}): Promise<React.ReactNode> {
  // TODO: re-enable when per diem rates are seeded
  if (!PER_DIEM_UI_ENABLED) {
    return <FeatureComingSoon moduleName="Per Diem" />;
  }
  const { employeeId } = await params;
  return <EmployeePerDiemRatesEditPageContent employeeId={employeeId} />;
}
