'use client';

import { useEffect } from 'react';
import { getFontScale } from '@/lib/theme/font-scale';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

/**
 * Applies the persisted font-size preference to the document root.
 */
export default function FontScaleSync(): null {
  const fontSizePx = useUiPreferencesStore((state) => state.fontSizePx);

  useEffect(() => {
    const root = document.documentElement;
    const scale = getFontScale(fontSizePx);

    root.style.setProperty('--erp-font-base', `${fontSizePx}px`);
    root.style.setProperty('--erp-font-scale', String(scale));
    root.dataset.fontSizePx = String(fontSizePx);
  }, [fontSizePx]);

  return null;
}
