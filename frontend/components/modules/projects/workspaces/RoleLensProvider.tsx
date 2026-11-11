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
  /** Register EDVs and upload file versions only - no package or metadata edits. */
  canUploadEngineeringDocuments: boolean;
  /** Matches schedule create permission used by submit-for-review API. */
  canSubmitDesignPackage: boolean;
  canApproveReview: boolean;
  /** Designer queue - acknowledge, revise, and resolve assigned comments. */
  canResolveAssignedComments: boolean;
  canViewSubmittals: boolean;
  canCreateSubmittals: boolean;
  canViewReviewInbox: boolean;
  /** Full review mode (batch approve, add comments, verify). */
  canAccessReviewMode: boolean;
  disciplineScopeBypass: boolean;
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
    canViewMyWork: boolean;
    canViewEngineering: boolean;
    canUploadEngineeringDocuments: boolean;
    disciplineScopeBypass: boolean;
    navDisciplineLeader: boolean;
    navDesigner: boolean;
  },
): RoleLens {
  const hasAssignedDesignAccess =
    epc.canViewEngineering ||
    epc.canViewReviewInbox ||
    epc.canViewMyComments ||
    epc.canViewMyWork;

  const engineeringView = hasAssignedDesignAccess || schedule.canView;

  const canUploadEngineeringDocuments =
    engineeringView &&
    (epc.canUploadEngineeringDocuments ||
      epc.canViewMyWork ||
      schedule.canEdit);
  const canSubmitDesignPackage =
    engineeringView &&
    (schedule.canCreate || schedule.canEdit || epc.canViewMyWork);
  const canViewReviewInbox = epc.canViewReviewInbox;
  const canViewMyComments = epc.canViewMyComments;

  /** FK discipline lead / designer - construction submittals without RBAC module grants. */
  const canAccessConstructionSubmittals =
    epc.navDisciplineLeader || epc.navDesigner;

  return {
    canViewEngineering: engineeringView,
    canCreateEngineering:
      engineeringView && (schedule.canCreate || schedule.canEdit || epc.canViewMyWork),
    canEditEngineering:
      engineeringView && (schedule.canEdit || epc.canViewMyWork),
    canUploadEngineeringDocuments,
    canSubmitDesignPackage,
    canApproveReview: canViewReviewInbox,
    canResolveAssignedComments: canViewMyComments,
    canViewSubmittals: submittals.canView || canAccessConstructionSubmittals,
    canCreateSubmittals:
      submittals.canCreate || canAccessConstructionSubmittals,
    canViewReviewInbox,
    canAccessReviewMode: canViewReviewInbox,
    disciplineScopeBypass: epc.disciplineScopeBypass,
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
