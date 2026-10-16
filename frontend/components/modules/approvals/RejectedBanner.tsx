'use client';

import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Read-only rejection banner - no actions.
 */
export default function RejectedBanner({
  note,
}: {
  note?: string | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const trimmed = note?.trim();

  return (
    <ErpNotice
      tone="error"
      title={t('pages.approvals.rejectedTitle')}
      description={trimmed || undefined}
    />
  );
}
