'use client';

import { create } from 'zustand';
import type { EdvStatus } from '@/lib/api/epc.types';

interface ReviewWorkspaceState {
  activeDesignPackageId: string | null;
  activeReviewSessionId: string | null;
  selectedEdvIds: string[];
  setActiveDesignPackage: (packageId: string | null) => void;
  setActiveReviewSession: (sessionId: string | null) => void;
  setSelectedEdvIds: (ids: string[]) => void;
  toggleEdvSelection: (edvId: string) => void;
  selectAllEdvs: (edvIds: string[]) => void;
  clearEdvSelection: () => void;
  isEdvSelected: (edvId: string) => boolean;
}

export const useReviewWorkspaceStore = create<ReviewWorkspaceState>((set, get) => ({
  activeDesignPackageId: null,
  activeReviewSessionId: null,
  selectedEdvIds: [],

  setActiveDesignPackage: (packageId) => {
    set({ activeDesignPackageId: packageId });
  },

  setActiveReviewSession: (sessionId) => {
    set({ activeReviewSessionId: sessionId, selectedEdvIds: [] });
  },

  setSelectedEdvIds: (ids) => {
    set({ selectedEdvIds: [...ids] });
  },

  toggleEdvSelection: (edvId) => {
    const current = get().selectedEdvIds;
    if (current.includes(edvId)) {
      set({ selectedEdvIds: current.filter((id) => id !== edvId) });
      return;
    }
    set({ selectedEdvIds: [...current, edvId] });
  },

  selectAllEdvs: (edvIds) => {
    set({ selectedEdvIds: [...edvIds] });
  },

  clearEdvSelection: () => {
    set({ selectedEdvIds: [] });
  },

  isEdvSelected: (edvId) => get().selectedEdvIds.includes(edvId),
}));

/** Display labels for EDV lifecycle states. */
export const EDV_STATUS_LABELS: Record<EdvStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  LOCKED: 'Locked',
  SUPERSEDED: 'Superseded',
};
