'use client';

import { create } from 'zustand';
import type { ReactNode } from 'react';

interface HeaderExtraState {
  extra: ReactNode | null;
  setExtra: (node: ReactNode | null) => void;
}

/**
 * Lets the active page inject content into the sticky MainContentHeader's
 * right-hand slot (next to notifications / profile), e.g. a view toggle.
 */
export const useHeaderExtraStore = create<HeaderExtraState>((set) => ({
  extra: null,
  setExtra: (node) => set({ extra: node }),
}));
