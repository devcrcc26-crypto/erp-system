'use client';

import { MetaItem } from '@/components/modules/hr/shared/hr-page-chrome';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatSealCategory } from '@/lib/utils/seal-category';

interface SealRequestDetailFieldsProps {
  sealCategory?: string | null;
  copyCount?: number | null;
  remarks?: string | null;
}

/** Read-only seal category, copy count, and remarks for detail pages. */
export default function SealRequestDetailFields({
  sealCategory,
  copyCount,
  remarks,
}: SealRequestDetailFieldsProps): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <>
      <MetaItem label={t('hr.form.sealCategory')}>
        {formatSealCategory(sealCategory, t)}
      </MetaItem>
      <MetaItem label={t('hr.form.copyCount')}>
        {copyCount != null ? String(copyCount) : '—'}
      </MetaItem>
      <MetaItem label={t('hr.form.remarks')}>
        {remarks?.trim() ? (
          <p className="m-0 whitespace-pre-wrap leading-relaxed">{remarks}</p>
        ) : (
          '—'
        )}
      </MetaItem>
    </>
  );
}
