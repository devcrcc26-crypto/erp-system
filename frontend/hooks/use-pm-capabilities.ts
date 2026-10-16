'use client';

import { useAuthStore } from '@/stores/auth.store';
import type { ModuleCapabilities } from '@/lib/api/project-management.types';
import type { EpcCapabilities } from '@/lib/api/types';
import { EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';
import type { ProjectNavCapability } from '@/lib/navigation/project-workspace-nav';

/**
 * Returns PM module capabilities from the authenticated session.
 */
export function usePmCapabilities(): ReturnType<
  typeof useAuthStore.getState
>['capabilities']['pm'] {
  return useAuthStore((state) => state.capabilities.pm);
}

/**
 * Returns EPC workspace capability flags from endpoint probes.
 */
export function useEpcCapabilities(): EpcCapabilities {
  return useAuthStore(
    (state) => state.capabilities.epc ?? EMPTY_EPC_CAPABILITIES,
  );
}

/**
 * True after session capabilities have been loaded from the API.
 */
export function useCapabilitiesReady(): boolean {
  return useAuthStore((state) => state.capabilitiesReady);
}

/**
 * True while session capabilities are still loading.
 */
export function usePermissionsLoading(): boolean {
  return !useCapabilitiesReady();
}

/**
 * Checks whether the user can view a project workspace nav item (PM module only).
 */
export function useCanViewProjectNav(
  capability: ProjectNavCapability,
): boolean {
  const pm = usePmCapabilities();
  const moduleCaps: ModuleCapabilities = pm[capability];
  return moduleCaps.canView;
}

/**
 * Review inbox - requires inbox probe and schedule module access.
 */
export function useCanViewReviewInbox(): boolean {
  return useEpcCapabilities().canViewReviewInbox;
}

/**
 * Designer comment queue - requires my-comments probe.
 */
export function useCanViewMyComments(): boolean {
  return useEpcCapabilities().canViewMyComments;
}

/**
 * Assigned tasks and subtasks for the current user.
 */
export function useCanViewMyWork(): boolean {
  return useEpcCapabilities().canViewMyWork;
}

/**
 * True when the user should see company-wide portfolio lists (not FK-scoped /my).
 */
export function useGlobalPortfolioListMode(): boolean {
  const pm = usePmCapabilities();
  return pm.projects.canView;
}

/**
 * Global construction submittals - full-access, designer / discipline-lead, or module view.
 */
export function useCanViewSubmittals(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  return (
    epc.navFullAccess ||
    epc.navDesigner ||
    epc.navDisciplineLeader ||
    pm.submittals.canView
  );
}

/**
 * Global external releases - full-access, designer / discipline-lead, or module view.
 * Same visibility formula as construction submittals (shares the `submittals` module).
 */
export function useCanViewExternalReleases(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  return (
    epc.navFullAccess ||
    epc.navDesigner ||
    epc.navDisciplineLeader ||
    pm.submittals.canView
  );
}

/**
 * Global change requests - full-access, designer / discipline-lead, or module view.
 */
export function useCanViewChangeRequests(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  return (
    epc.navFullAccess ||
    epc.navDesigner ||
    epc.navDisciplineLeader ||
    pm.change_requests.canView
  );
}

/**
 * Global RFIs - full-access / FK designer-lead always; otherwise only when
 * rfis.canView without portfolio projects.canView (project sidebar otherwise).
 */
export function useCanViewRfis(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  if (epc.navFullAccess) {
    return true;
  }
  const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
  if (isFkUser) {
    return true;
  }
  return (pm.rfis?.canView ?? false) && !pm.projects.canView;
}

/**
 * Global Issues - full-access / FK designer-lead always; otherwise only when
 * issues.canView without portfolio projects.canView (project sidebar otherwise).
 */
export function useCanViewIssues(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  if (epc.navFullAccess) {
    return true;
  }
  const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
  if (isFkUser) {
    return true;
  }
  return pm.issues.canView && !pm.projects.canView;
}

/**
 * Global Meetings - full-access / FK designer-lead always; otherwise only when
 * meetings.canView without portfolio projects.canView (project sidebar otherwise).
 */
export function useCanViewMeetings(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  if (epc.navFullAccess) {
    return true;
  }
  const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
  if (isFkUser) {
    return true;
  }
  return pm.meetings.canView && !pm.projects.canView;
}

/**
 * Global Correspondence - full-access only (project managers use the
 * project sidebar; the global page is reserved for portfolio administrators).
 */
export function useCanViewCorrespondence(): boolean {
  const epc = useEpcCapabilities();
  return epc.navFullAccess;
}

/**
 * Global Risks - full-access always; discipline leads always (risks are
 * management-level, not a designer concern); otherwise only when
 * risks.canView without portfolio projects.canView (project sidebar otherwise).
 */
export function useCanViewRisks(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  if (epc.navFullAccess) {
    return true;
  }
  if (epc.navDisciplineLeader) {
    return true;
  }
  return pm.risks.canView && !pm.projects.canView;
}

/**
 * Global Punch List - discipline leads always; otherwise only when
 * punchItems.canView without portfolio projects.canView (project sidebar otherwise).
 */
export function useCanViewPunchList(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  if (epc.navDisciplineLeader) {
    return true;
  }
  return pm.punchItems.canView && !pm.projects.canView;
}

/**
 * Global Daily Logs - full-access / FK designer-lead always; otherwise only when
 * dailyLogs.canView without portfolio projects.canView (project sidebar otherwise).
 */
export function useCanViewDailyLogs(): boolean {
  const epc = useEpcCapabilities();
  const pm = usePmCapabilities();
  if (epc.navFullAccess) {
    return true;
  }
  const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
  if (isFkUser) {
    return true;
  }
  return pm.dailyLogs.canView && !pm.projects.canView;
}

/**
 * Any EPC global workspace nav entry.
 */
export function useCanViewEpcWorkspaces(): boolean {
  return (
    useCanViewReviewInbox() ||
    useCanViewMyComments() ||
    useCanViewMyWork() ||
    useEpcCapabilities().canViewEngineering
  );
}

/**
 * Schedule-scoped EPC engineering pages (disciplines, status board, workload).
 */
export function useCanViewEpcEngineering(): boolean {
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  return pm.schedule.canView && epc.canViewEngineering;
}
