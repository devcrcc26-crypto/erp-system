'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useEpcCapabilities,
  usePmCapabilities,
} from '@/hooks/use-pm-capabilities';

export interface RoleLens {
  canViewEngineering: boolean;
  canCreateEngineering: boolean;
  canEditEngineering: boolean;
  canApproveReview: boolean;
  canViewSubmittals: boolean;
  canCreateSubmittals: boolean;
  canViewReviewInbox: boolean;
  canViewMyComments: boolean;
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
  epc: {
    canViewReviewInbox: boolean;
    canViewMyComments: boolean;
    canViewEngineering: boolean;
  },
): RoleLens {
  const engineeringView = schedule.canView && epc.canViewEngineering;

  return {
    canViewEngineering: engineeringView,
    canCreateEngineering: engineeringView && schedule.canCreate,
    canEditEngineering: engineeringView && schedule.canEdit,
    canApproveReview: schedule.canEdit,
    canViewSubmittals: submittals.canView,
    canCreateSubmittals: submittals.canCreate,
    canViewReviewInbox: epc.canViewReviewInbox && schedule.canView,
    canViewMyComments:
      epc.canViewMyComments && (schedule.canEdit || schedule.canView),
    isReviewerWorkspace: epc.canViewReviewInbox || schedule.canView,
    isDesignerWorkspace: engineeringView && schedule.canEdit,
  };
}

/**
 * Resolves EPC workspace actions from PM schedule/submittals + EPC endpoint probes.
 */
export function RoleLensProvider({ children }: { children: ReactNode }): ReactNode {
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();

  const lens = useMemo(
    () => buildRoleLens(pm.schedule, pm.submittals, epc),
    [epc, pm.schedule, pm.submittals],
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
