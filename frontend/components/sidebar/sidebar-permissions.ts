import type { Capabilities } from '@/lib/api/types';
import { canViewGlobalNavKey } from '@/lib/navigation/project-nav-visibility';
import type { SidebarPermission } from '@/components/sidebar/sidebar.config';

export interface SidebarPermissionContext {
  /** Session capabilities from `/auth/capabilities`. */
  readonly capabilities: Capabilities;
  /** False until capabilities have loaded — resolves to no permissions. */
  readonly ready: boolean;
  /** Holds the Project Administrator role (disciplines catalog access). */
  readonly hasProjectAdministratorRole: boolean;
}

/**
 * Maps session capability flags onto sidebar permission tokens.
 *
 * This is the ONLY place navigation visibility is derived from backend
 * capabilities. When the backend exposes a finer-grained flag (for example a
 * dedicated procurement permission for storekeepers), change the matching
 * line here — the config and components stay untouched.
 */
export function resolveSidebarPermissions(
  context: SidebarPermissionContext,
): ReadonlySet<SidebarPermission> {
  const granted = new Set<SidebarPermission>();
  if (!context.ready) {
    return granted;
  }

  const caps = context.capabilities;
  const { pm, epc } = caps;

  function grant(token: SidebarPermission, allowed: boolean): void {
    if (allowed) {
      granted.add(token);
    }
  }

  /** Design-cycle persona gate shared with the project workspace nav. */
  function global(href: string, allowed: boolean): boolean {
    return allowed && canViewGlobalNavKey(href, epc, pm);
  }

  const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
  const hr = caps.canViewHr;
  const flight = hr || caps.canViewFlight || caps.canCreateFlight || caps.canManageFlight;
  const businessTrip =
    hr ||
    caps.canViewBusinessTrip ||
    caps.canCreateBusinessTrip ||
    caps.canManageBusinessTrip;

  // Cross-cutting
  grant('approvals.view', global('/approvals', true));
  grant('audit.view', caps.canViewAuditLogs);
  grant('settings.manage', caps.canManageRoles || caps.canEditRoles);
  grant('users.manage', caps.canManageUsers);

  // Human resources — self-service entries widen beyond hr.view
  grant('hr.view', hr);
  grant('leave.access', hr || caps.canViewLeave || caps.canCreateLeave);
  grant('overtime.access', hr || caps.canViewOvertime || caps.canCreateOvertime);
  grant('flight.access', flight);
  grant('businessTrip.access', businessTrip);
  // Expense claims are self-service (see app/(dashboard)/hr/layout.tsx);
  // shown to anyone who travels on company business.
  grant('expenseClaims.access', hr || flight || businessTrip);
  grant('perDiemRates.manage', hr || caps.canManageUsers);
  // No dedicated backend flags yet — the /hr route guard requires hr.view.
  grant('procurement.access', hr);
  grant('fleet.access', hr);
  grant('administration.access', hr);

  // Organization
  const orgStructure =
    caps.isSystemAdministrator || hr || epc.navFullAccess || epc.navDepartmentLeader;
  grant('org.departments', orgStructure);
  grant('org.positions', orgStructure);
  grant(
    'org.disciplines',
    caps.isSystemAdministrator ||
      epc.navFullAccess ||
      hr ||
      context.hasProjectAdministratorRole,
  );
  grant('org.vehicles', hr);

  // Project management
  const portfolio = pm.projects.canView;
  grant('pm.projects', global('/projects', portfolio));
  grant('pm.reviewInbox', global('/review-inbox', epc.canViewReviewInbox));
  grant('pm.myComments', global('/my-comments', epc.canViewMyComments));
  grant('pm.myWork', global('/my-work', epc.canViewMyWork));
  grant(
    'pm.submittals',
    global('/submittals', epc.navFullAccess || isFkUser || pm.submittals.canView),
  );
  grant(
    'pm.externalReleases',
    global('/external-releases', epc.navFullAccess || isFkUser || pm.submittals.canView),
  );
  grant(
    'pm.changeRequests',
    global('/change-requests', epc.navFullAccess || isFkUser || pm.change_requests.canView),
  );
  grant(
    'pm.rfis',
    global('/rfis', epc.navFullAccess || isFkUser || ((pm.rfis?.canView ?? false) && !portfolio)),
  );
  grant(
    'pm.issues',
    global('/issues', epc.navFullAccess || isFkUser || (pm.issues.canView && !portfolio)),
  );
  grant(
    'pm.risks',
    global(
      '/risks',
      epc.navFullAccess || epc.navDisciplineLeader || (pm.risks.canView && !portfolio),
    ),
  );
  grant(
    'pm.punchList',
    global('/punch-list', epc.navDisciplineLeader || (pm.punchItems.canView && !portfolio)),
  );
  grant(
    'pm.dailyLogs',
    global('/daily-logs', epc.navFullAccess || isFkUser || (pm.dailyLogs.canView && !portfolio)),
  );
  grant(
    'pm.meetings',
    global('/meetings', epc.navFullAccess || isFkUser || (pm.meetings.canView && !portfolio)),
  );
  grant('pm.correspondence', global('/correspondence', epc.navFullAccess));

  return granted;
}
