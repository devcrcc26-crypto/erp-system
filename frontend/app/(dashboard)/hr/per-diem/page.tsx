import FeatureComingSoon from '@/components/ui/FeatureComingSoon/FeatureComingSoon';
import PerDiemRequestsListPageContent from '@/components/modules/hr/per-diem/PerDiemRequestsListPageContent';
import { PER_DIEM_UI_ENABLED } from '@/lib/features/per-diem-ui';

export default function PerDiemRequestsPage(): React.ReactNode {
  // TODO: re-enable when per diem rates are seeded
  if (!PER_DIEM_UI_ENABLED) {
    return <FeatureComingSoon moduleName="Per Diem" />;
  }
  return <PerDiemRequestsListPageContent />;
}
