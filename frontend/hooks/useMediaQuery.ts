'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = (): void => setMatches(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/** Tailwind `md` breakpoint - 768px and up. */
export function useIsMdUp(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

/** Tailwind `lg` breakpoint - 1024px and up. */
export function useIsLgUp(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
