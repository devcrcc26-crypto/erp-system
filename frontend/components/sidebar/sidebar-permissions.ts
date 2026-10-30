import type { Capabilities } from '@/lib/api/types';
import { canViewGlobalNavKey } from '@/lib/navigation/project-nav-visibility';
import type { SidebarPermission } from '@/components/sidebar/sidebar.config';

export interface SidebarPermissionContext {
  /** Session capabilities from `/auth/capabilities`. */
  readonly capabilities: Capabilities;
  /** False until capabilities have loaded - resolves to no permissions. */
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
 * line here - the config and components stay untouched.
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

  // Evaluation inbox for non-HR leads (HR users get it under Performance).
  grant('evaluation.inbox', !hr);

  // Human resources - self-service entries widen beyond hr.view
  grant('hr.view', hr);
  // Supervisors (anyone with direct reports) get team-scoped HR lists; the
  // backend scopes the data to their full reporting chain.
  const team = hr || caps.hasDirectReports;
  grant('team.view', team);
  // My Team is the supervisor's employee list; HR has the full Users list.
  grant('team.members', caps.hasDirectReports && !caps.canManageUsers);
  grant('leave.access', hr || caps.canViewLeave || caps.canCreateLeave);
  // Direct WFH assignment (no approval) is HR only; others use New Request.
  grant('wfh.assign', hr);
  grant('overtime.access', hr || caps.canViewOvertime || caps.canCreateOvertime);
  grant(
    'payroll.access',
    caps.canAccessPayroll ||
      caps.canCreatePayroll ||
      caps.canEditPayroll ||
      caps.canApprovePayroll,
  );
  // The /hr flight and business-trip LISTS are HR-only - app/(dashboard)/hr/layout.tsx
  // redirects everyone else. Employees submit these via the /approvals/new forms.
  grant('flight.access', hr);
  grant('businessTrip.access', hr);
  // Expense claim and per diem lists are for HR, admins and supervisors.
  // Other employees file and track their own via New Request and Approvals.
  const payTravelLists = team || caps.isSystemAdministrator;
  grant('expenseClaims.access', payTravelLists);
  grant('perDiem.access', payTravelLists);
  grant('perDiemRates.manage', hr || caps.canManageUsers);  // No dedicated backend flags yet - the /hr route guard requires hr.view.
  grant(
    'procurement.access',
    caps.canCreatePurchaseRequest || caps.canViewPurchaseRequest,
  );
  grant('fleet.access', hr);
  grant('administration.access', hr);
  grant('announcements.manage', caps.canManageAnnouncements ?? false);

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

  // Project management — company module toggle; sidebar limited to System Administrator for now.
  const pmModuleOn =
    caps.modulesProjectManagementEnabled && caps.isSystemAdministrator;
  const portfolio = pm.projects.canView;
  grant('pm.projects', pmModuleOn && global('/projects', portfolio));
  grant(
    'pm.reviewInbox',
    pmModuleOn && global('/review-inbox', epc.canViewReviewInbox),
  );
  grant(
    'pm.myComments',
    pmModuleOn && global('/my-comments', epc.canViewMyComments),
  );
  grant('pm.myWork', pmModuleOn && global('/my-work', epc.canViewMyWork));
  grant(
    'pm.submittals',
    pmModuleOn &&
      global('/submittals', epc.navFullAccess || isFkUser || pm.submittals.canView),
  );
  grant(
    'pm.externalReleases',
    pmModuleOn &&
      global(
        '/external-releases',
        epc.navFullAccess || isFkUser || pm.submittals.canView,
      ),
  );
  grant(
    'pm.changeRequests',
    pmModuleOn &&
      global(
        '/change-requests',
        epc.navFullAccess || isFkUser || pm.change_requests.canView,
      ),
  );
  grant(
    'pm.rfis',
    pmModuleOn &&
      global(
        '/rfis',
        epc.navFullAccess || isFkUser || ((pm.rfis?.canView ?? false) && !portfolio),
      ),
  );
  grant(
    'pm.issues',
    pmModuleOn &&
      global(
        '/issues',
        epc.navFullAccess || isFkUser || (pm.issues.canView && !portfolio),
      ),
  );
  grant(
    'pm.risks',
    pmModuleOn &&
      global(
        '/risks',
        epc.navFullAccess || epc.navDisciplineLeader || (pm.risks.canView && !portfolio),
      ),
  );
  grant(
    'pm.punchList',
    pmModuleOn &&
      global(
        '/punch-list',
        epc.navDisciplineLeader || (pm.punchItems.canView && !portfolio),
      ),
  );
  grant(
    'pm.dailyLogs',
    pmModuleOn &&
      global(
        '/daily-logs',
        epc.navFullAccess || isFkUser || (pm.dailyLogs.canView && !portfolio),
      ),
  );
  grant(
    'pm.meetings',
    pmModuleOn &&
      global(
        '/meetings',
        epc.navFullAccess || isFkUser || (pm.meetings.canView && !portfolio),
      ),
  );
  grant(
    'pm.correspondence',
    pmModuleOn && global('/correspondence', epc.navFullAccess),
  );

  return granted;
}
