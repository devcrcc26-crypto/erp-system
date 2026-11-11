'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

/** True after Zustand persist has restored auth state from localStorage. */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persist = useAuthStore.persist;

    if (!persist) {
      setHydrated(true);
      return;
    }

    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }

    return persist.onFinishHydration(() => {
      setHydrated(true);
    });
  }, []);

  return hydrated;
}
