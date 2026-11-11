'use client';

import { create } from 'zustand';

interface BreadcrumbLabelState {
  currentLabel: string | null;
  setCurrentLabel: (label: string | null) => void;
}

/**
 * Lets a detail page replace the static last breadcrumb (e.g. "Overtime sheet")
 * with a record-specific label once its data has loaded.
 */
export const useBreadcrumbLabelStore = create<BreadcrumbLabelState>((set) => ({
  currentLabel: null,
  setCurrentLabel: (label) => set({ currentLabel: label }),
}));
