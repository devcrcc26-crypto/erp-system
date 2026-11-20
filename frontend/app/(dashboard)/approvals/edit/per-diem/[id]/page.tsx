import FeatureComingSoon from '@/components/ui/FeatureComingSoon/FeatureComingSoon';
import PerDiemRequestEditPageContent from '@/components/modules/hr/per-diem/PerDiemRequestEditPageContent';
import { PER_DIEM_UI_ENABLED } from '@/lib/features/per-diem-ui';

export default async function EditPerDiemRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  // TODO: re-enable when per diem rates are seeded
  if (!PER_DIEM_UI_ENABLED) {
    return <FeatureComingSoon moduleName="Per Diem" />;
  }
  const { id } = await params;
  return <PerDiemRequestEditPageContent requestId={id} />;
}
