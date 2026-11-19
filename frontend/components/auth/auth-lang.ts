'use client';

import { useMemo } from 'react';

/**
 * Auth pages render before the user's locale is known, so they follow the
 * document / browser language like the login form does.
 */
export function useIsZhDocument(): boolean {
  return useMemo(() => {
    const lang =
      typeof document !== 'undefined'
        ? document.documentElement.lang || navigator.language
        : 'en';
    return lang.toLowerCase().startsWith('zh');
  }, []);
}
