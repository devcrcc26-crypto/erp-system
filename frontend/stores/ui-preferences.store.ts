'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  clampFontSizePx,
  decreaseFontSizePx,
  FONT_SIZE_BASE_PX,
  increaseFontSizePx,
  UI_PREFERENCES_PERSIST_KEY,
} from '@/lib/theme/font-scale';

interface UiPreferencesState {
  fontSizePx: number;
  setFontSizePx: (fontSizePx: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>()(
  persist(
    (set, get) => ({
      fontSizePx: FONT_SIZE_BASE_PX,
      setFontSizePx: (fontSizePx: number) => {
        set({ fontSizePx: clampFontSizePx(fontSizePx) });
      },
      increaseFontSize: () => {
        set({ fontSizePx: increaseFontSizePx(get().fontSizePx) });
      },
      decreaseFontSize: () => {
        set({ fontSizePx: decreaseFontSizePx(get().fontSizePx) });
      },
      resetFontSize: () => {
        set({ fontSizePx: FONT_SIZE_BASE_PX });
      },
    }),
    {
      name: UI_PREFERENCES_PERSIST_KEY,
      partialize: (state) => ({ fontSizePx: state.fontSizePx }),
    },
  ),
);
