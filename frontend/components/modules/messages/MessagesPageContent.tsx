'use client';

import PlaceholderPage from '@/components/PlaceholderPage';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { Mail } from 'lucide-react';

export default function MessagesPageContent(): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <PlaceholderPage
      icon={Mail}
      title={t('nav.messages')}
      description={t('pages.messages.description')}
    />
  );
}
