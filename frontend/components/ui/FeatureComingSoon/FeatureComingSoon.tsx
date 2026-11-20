'use client';

import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Placeholder for temporarily disabled features (e.g. Per Diem until rates
 * are seeded). Keeps the route reachable without exposing the real UI.
 */
export default function FeatureComingSoon({
  moduleName,
}: {
  moduleName: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <div className="erp-pro-list-page">
      <ErpNotice
        tone="info"
        title={t('pages.hr.comingSoonTitle')}
        description={t('pages.hr.comingSoonDescription', { module: moduleName })}
      />
    </div>
  );
}
