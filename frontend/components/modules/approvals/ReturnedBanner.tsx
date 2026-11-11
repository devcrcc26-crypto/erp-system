'use client';

import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Banner shown when an approval was returned for revision.
 */
export default function ReturnedBanner({
  note,
}: {
  note?: string | null;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const trimmed = note?.trim();

  return (
    <ErpNotice
      tone="warning"
      title={t('pages.approvals.returnedTitle')}
      description={
        trimmed
          ? t('pages.approvals.returnedWithNote', { note: trimmed })
          : t('pages.approvals.returnedHint')
      }
    />
  );
}
