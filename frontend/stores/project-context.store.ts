'use client';

import { create } from 'zustand';
import type { ProjectSummary } from '@/lib/api/project-management.types';

interface ProjectContextState {
  activeProjectId: string | null;
  activeProject: ProjectSummary | null;
  setActiveProject: (project: ProjectSummary | null) => void;
  clearProjectContext: () => void;
}

export const useProjectContextStore = create<ProjectContextState>((set) => ({
  activeProjectId: null,
  activeProject: null,
  setActiveProject: (project) => {
    set({
      activeProject: project,
      activeProjectId: project?.id ?? null,
    });
  },
  clearProjectContext: () => {
    set({ activeProject: null, activeProjectId: null });
  },
}));
