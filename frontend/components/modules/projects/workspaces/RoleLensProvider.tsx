'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePmCapabilities } from '@/hooks/use-pm-capabilities';

export interface RoleLens {
  canViewEngineering: boolean;
  canCreateEngineering: boolean;
  canEditEngineering: boolean;
  canApproveReview: boolean;
  canViewSubmittals: boolean;
  canCreateSubmittals: boolean;
  isReviewerWorkspace: boolean;
  isDesignerWorkspace: boolean;
}

const RoleLensContext = createContext<RoleLens | null>(null);

function buildRoleLens(
  schedule: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  },
  submittals: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  },
): RoleLens {
  return {
    canViewEngineering: schedule.canView,
    canCreateEngineering: schedule.canCreate,
    canEditEngineering: schedule.canEdit,
    canApproveReview: schedule.canEdit,
    canViewSubmittals: submittals.canView,
    canCreateSubmittals: submittals.canCreate,
    isReviewerWorkspace: schedule.canView,
    isDesignerWorkspace: schedule.canView && schedule.canEdit,
  };
}

/**
 * Resolves EPC workspace actions from PM capability probes (schedule + submittals).
 */
export function RoleLensProvider({ children }: { children: ReactNode }): ReactNode {
  const pm = usePmCapabilities();

  const lens = useMemo(
    () => buildRoleLens(pm.schedule, pm.submittals),
    [pm.schedule, pm.submittals],
  );

  return (
    <RoleLensContext.Provider value={lens}>{children}</RoleLensContext.Provider>
  );
}

export function useRoleLens(): RoleLens {
  const context = useContext(RoleLensContext);
  if (!context) {
    throw new Error('useRoleLens must be used within RoleLensProvider');
  }
  return context;
}

/** Optional lens when provider may be absent (e.g. storybook). */
export function useOptionalRoleLens(): RoleLens | null {
  return useContext(RoleLensContext);
}
