'use client';

import { useLayoutEffect } from 'react';
import { accent } from '@/lib/theme/accent';

/**
 * Pushes {@link accent} into CSS custom properties so hardcoded UI styles
 * that use --erp-accent* follow the same reversible ACCENT_MODE switch.
 */
export default function ThemeAccentSync(): null {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--erp-accent', accent.primary);
    root.style.setProperty('--erp-accent-hover', accent.hover);
    root.style.setProperty('--erp-accent-light', accent.light);
    root.style.setProperty('--erp-accent-soft', accent.softHover);
    root.style.setProperty('--erp-accent-rgb', accent.primaryRgb);
    root.style.setProperty('--erp-accent-hover-rgb', accent.hoverRgb);
  }, []);

  return null;
}
