'use client';

import PlaceholderPage from '@/components/PlaceholderPage';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { BarChart3 } from 'lucide-react';

export default function ReportsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <PlaceholderPage
      icon={BarChart3}
      title={t('nav.reports')}
      description={t('pages.reports.description')}
    />
  );
}
