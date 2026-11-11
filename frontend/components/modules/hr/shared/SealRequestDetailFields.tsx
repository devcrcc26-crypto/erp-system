'use client';

import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatSealCategory } from '@/lib/utils/seal-category';

interface SealRequestDetailFieldsProps {
  sealCategory?: string | null;
  copyCount?: number | null;
}

/** Read-only seal category and copy count for detail pages. */
export default function SealRequestDetailFields({
  sealCategory,
  copyCount,
}: SealRequestDetailFieldsProps): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <>
      <MetaItem label={t('hr.form.sealCategory')}>
        {formatSealCategory(sealCategory, t)}
      </MetaItem>
      <MetaItem label={t('hr.form.copyCount')}>
        {copyCount != null ? String(copyCount) : '-'}
      </MetaItem>
    </>
  );
}
