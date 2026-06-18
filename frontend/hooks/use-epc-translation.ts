'use client';

import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  normalizeEpcLocale,
  translateEpc,
  type EpcLocale,
} from '@/lib/i18n/epc-messages';

export interface EpcTranslation {
  locale: EpcLocale;
  t: (key: string) => string;
}

/**
 * EPC-scoped translation helper using the authenticated user's preferred language.
 */
export function useEpcTranslation(): EpcTranslation {
  const preferredLanguage = useAuthStore(
    (state) => state.user?.preferredLanguage,
  );

  const locale = useMemo(
    () => normalizeEpcLocale(preferredLanguage),
    [preferredLanguage],
  );

  const t = useCallback(
    (key: string): string => translateEpc(locale, key),
    [locale],
  );

  return { locale, t };
}
