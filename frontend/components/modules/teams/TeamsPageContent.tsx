'use client';

import PlaceholderPage from '@/components/PlaceholderPage';
import ThreePeopleIcon from '@/components/ThreePeopleIcon';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

export default function TeamsPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <PlaceholderPage
      icon={ThreePeopleIcon}
      title={t('nav.teams')}
      description={t('teams.description')}
    />
  );
}
