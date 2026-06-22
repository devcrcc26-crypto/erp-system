'use client';

import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  normalizeEpcLocale,
  translateEpcWithVars,
  type EpcLocale,
} from '@/lib/i18n/epc-messages';

export interface EpcTranslation {
  locale: EpcLocale;
  t: (key: string, vars?: Record<string, string | number>) => string;
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
    (key: string, vars?: Record<string, string | number>): string =>
      translateEpcWithVars(locale, key, vars),
    [locale],
  );

  return { locale, t };
}
