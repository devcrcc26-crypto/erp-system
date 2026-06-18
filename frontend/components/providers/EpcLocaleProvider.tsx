'use client';

import { useEffect } from 'react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { epcLocaleToHtmlLang, isRtlLocale } from '@/lib/i18n/epc-messages';

/**
 * Syncs document lang/dir with the user's EPC locale preference.
 */
export default function EpcLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const { locale } = useEpcTranslation();

  useEffect(() => {
    document.documentElement.lang = epcLocaleToHtmlLang(locale);
    document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  return children;
}
