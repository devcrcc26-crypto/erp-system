import FeatureComingSoon from '@/components/ui/FeatureComingSoon/FeatureComingSoon';
import PerDiemRequestDetailPageContent from '@/components/modules/hr/per-diem/PerDiemRequestDetailPageContent';
import { PER_DIEM_UI_ENABLED } from '@/lib/features/per-diem-ui';

export default async function PerDiemRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  // TODO: re-enable when per diem rates are seeded
  if (!PER_DIEM_UI_ENABLED) {
    return <FeatureComingSoon moduleName="Per Diem" />;
  }
  const { id } = await params;
  return <PerDiemRequestDetailPageContent requestId={id} />;
}
