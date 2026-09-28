/**
 * Single source of truth for the main sidebar.
 *
 * Adding a module = adding one `link` entry to a group below. Components never
 * hard-code destinations; they render whatever survives permission filtering.
 * See `SIDEBAR.md` in this folder for the full contract.
 */

/**
 * Permission tokens the sidebar understands. Resolved from session
 * capabilities in `sidebar-permissions.ts` — the only place that maps
 * backend flags onto navigation visibility.
 */
export type SidebarPermission =
  | 'approvals.view'
  | 'audit.view'
  | 'settings.manage'
  | 'users.manage'
  | 'hr.view'
  | 'leave.access'
  | 'overtime.access'
  | 'flight.access'
  | 'businessTrip.access'
  | 'expenseClaims.access'
  | 'perDiemRates.manage'
  | 'procurement.access'
  | 'fleet.access'
  | 'administration.access'
  | 'org.departments'
  | 'org.positions'
  | 'org.disciplines'
  | 'org.vehicles'
  | 'pm.projects'
  | 'pm.reviewInbox'
  | 'pm.myComments'
  | 'pm.myWork'
  | 'pm.submittals'
  | 'pm.externalReleases'
  | 'pm.changeRequests'
  | 'pm.rfis'
  | 'pm.issues'
  | 'pm.risks'
  | 'pm.punchList'
  | 'pm.dailyLogs'
  | 'pm.meetings'
  | 'pm.correspondence';

/** Live counters a link can display. Resolved in `use-sidebar-data.ts`. */
export type SidebarBadgeSource = 'pendingApprovals';

interface SidebarLinkBase {
  readonly kind: 'link';
  /** Stable id — used for favorites and active-state resolution. */
  readonly id: string;
  /** i18n key in `locales/{en,zh}/epc.json`. */
  readonly labelKey: string;
  /** One-line caption for the compact rail when the label is too long (top-level only). */
  readonly shortLabelKey?: string;
  /** Icon registry key from `lib/navigation/nav-icons.tsx`. */
  readonly icon: string;
  /**
   * Visible when the session holds ANY of these. Omit for links every
   * signed-in user may open.
   */
  readonly requires?: readonly SidebarPermission[];
  /** Extra route prefixes that also mark this link active. */
  readonly activePaths?: readonly string[];
  readonly badge?: SidebarBadgeSource;
  /** Extra search terms (synonyms) for "Find a module". */
  readonly keywords?: readonly string[];
  /** Temporarily hidden from everyone (kept in config so it is easy to restore). */
  readonly hidden?: boolean;
}

export type SidebarLinkConfig = SidebarLinkBase &
  (
    | { readonly href: string; readonly comingSoon?: false }
    /** Placeholder row with no route yet — rendered as non-interactive text. */
    | { readonly href: null; readonly comingSoon: true }
  );

export interface SidebarGroupConfig {
  readonly id: string;
  readonly labelKey: string;
  readonly items: readonly SidebarLinkConfig[];
}

export interface SidebarFolderConfig {
  readonly kind: 'folder';
  readonly id: string;
  readonly labelKey: string;
  /** One-line caption for the compact rail when the label is too long. */
  readonly shortLabelKey?: string;
  readonly icon: string;
  /** Temporarily hidden from everyone (kept in config so it is easy to restore). */
  readonly hidden?: boolean;
  readonly groups: readonly SidebarGroupConfig[];
  /**
   * On `/projects/:id` routes, prepend the project workspace groups
   * (from `lib/navigation/project-workspace-nav.ts`) to this folder.
   */
  readonly hostsProjectContext?: boolean;
}

export type SidebarEntryConfig = SidebarLinkConfig | SidebarFolderConfig;

export interface SidebarLimitedNavigation {
  /** Sessions holding this permission get the full sidebar. */
  readonly unlessGranted: SidebarPermission;
  /** Everyone else sees only these top-level entry ids. */
  readonly entryIds: readonly string[];
}

export interface SidebarConfig {
  /** Top of the sidebar — dashboard and module folders. */
  readonly primary: readonly SidebarEntryConfig[];
  /** Pinned to the bottom of the sidebar, still inside the one `<nav>`. */
  readonly utility: readonly SidebarEntryConfig[];
  /** Reduced sidebar for sessions without a given permission. */
  readonly limitedNavigation?: SidebarLimitedNavigation;
}

/** Widths (px). Compact + docked panel stays under the 400px budget. */
export const SIDEBAR_EXPANDED_WIDTH = 272;
export const SIDEBAR_COMPACT_WIDTH = 84;
export const SIDEBAR_PANEL_WIDTH = 272;
export const SIDEBAR_DRAWER_WIDTH = 304;

export const SIDEBAR_MAX_FAVORITES = 5;

export const SIDEBAR_STORAGE_KEYS = {
  mode: 'sidebar:mode',
  collapsedGroups: 'sidebar:collapsed-groups',
  favoritesPrefix: 'sidebar:favorites:',
} as const;

const HR = ['hr.view'] as const;

export const SIDEBAR_CONFIG: SidebarConfig = {
  // Staff without hr.view get a self-service sidebar only.
  limitedNavigation: {
    unlessGranted: 'hr.view',
    entryIds: ['dashboard', 'new-request', 'approvals', 'my-profile'],
  },
  primary: [
    {
      kind: 'link',
      id: 'dashboard',
      labelKey: 'nav.dashboard',
      icon: 'dashboard',
      href: '/',
      keywords: ['home', 'overview'],
    },
    {
      // Direct link to the request picker. Its prefix also keeps New Request
      // highlighted on every /approvals/new/* form.
      kind: 'link',
      id: 'new-request',
      labelKey: 'nav.groups.newRequest',
      shortLabelKey: 'nav.short.newRequest',
      icon: 'new-request',
      href: '/approvals/new',
      keywords: ['apply', 'submit', 'form'],
    },
    {
      kind: 'folder',
      id: 'pm',
      // Visible only to System Administrator (pm.* tokens gated in
      // sidebar-permissions.ts). Hosts project workspace nav on /projects/:id.
      labelKey: 'nav.groups.projectManagement',
      shortLabelKey: 'nav.short.projectManagement',
      icon: 'domain-projects',
      hostsProjectContext: true,
      groups: [
        {
          id: 'pm-workspace',
          labelKey: 'nav.sections.workspace',
          items: [
            { kind: 'link', id: 'projects', labelKey: 'nav.projects', icon: 'projects', href: '/projects', requires: ['pm.projects'] },
            { kind: 'link', id: 'review-inbox', labelKey: 'nav.reviewInbox', icon: 'review-inbox', href: '/review-inbox', requires: ['pm.reviewInbox'] },
            { kind: 'link', id: 'my-comments', labelKey: 'nav.myComments', icon: 'my-comments', href: '/my-comments', requires: ['pm.myComments'] },
            { kind: 'link', id: 'my-work', labelKey: 'nav.myWork', icon: 'my-work', href: '/my-work', requires: ['pm.myWork'], keywords: ['tasks', 'assigned'] },
            { kind: 'link', id: 'kanban-board', labelKey: 'nav.kanbanBoard', icon: 'kanban', href: '/kanban-board', requires: ['pm.projects'] },
            { kind: 'link', id: 'reports', labelKey: 'nav.reports', icon: 'reports', href: '/reports', requires: ['pm.projects'] },
          ],
        },
        {
          id: 'pm-engineering',
          labelKey: 'nav.sections.engineering',
          items: [
            { kind: 'link', id: 'submittals', labelKey: 'nav.submittals', icon: 'submittals', href: '/submittals', requires: ['pm.submittals'] },
            { kind: 'link', id: 'external-releases', labelKey: 'nav.externalReleases', icon: 'external-release', href: '/external-releases', requires: ['pm.externalReleases'] },
            { kind: 'link', id: 'change-requests', labelKey: 'nav.changeRequests', icon: 'change-requests', href: '/change-requests', requires: ['pm.changeRequests'] },
            { kind: 'link', id: 'rfis', labelKey: 'nav.rfis', icon: 'rfis', href: '/rfis', requires: ['pm.rfis'], keywords: ['request for information'] },
          ],
        },
        {
          id: 'pm-site-ops',
          labelKey: 'nav.sections.siteOps',
          items: [
            { kind: 'link', id: 'issues', labelKey: 'nav.issues', icon: 'issues', href: '/issues', requires: ['pm.issues'] },
            { kind: 'link', id: 'risks', labelKey: 'nav.risks', icon: 'risks', href: '/risks', requires: ['pm.risks'] },
            { kind: 'link', id: 'punch-list', labelKey: 'nav.punchList', icon: 'punch-list', href: '/punch-list', requires: ['pm.punchList'], keywords: ['defects', 'snag'] },
            { kind: 'link', id: 'daily-logs', labelKey: 'nav.dailyLogs', icon: 'daily-logs', href: '/daily-logs', requires: ['pm.dailyLogs'], keywords: ['site diary'] },
            { kind: 'link', id: 'meetings', labelKey: 'nav.meetings', icon: 'meetings', href: '/meetings', requires: ['pm.meetings'] },
            { kind: 'link', id: 'correspondence', labelKey: 'nav.correspondence', icon: 'correspondence', href: '/correspondence', requires: ['pm.correspondence'], keywords: ['letters'] },
          ],
        },
      ],
    },
    {
      kind: 'folder',
      id: 'hr',
      labelKey: 'nav.groups.humanResources',
      shortLabelKey: 'nav.short.humanResources',
      icon: 'domain-hr',
      groups: [
        {
          id: 'hr-people',
          labelKey: 'nav.sections.people',
          items: [
            { kind: 'link', id: 'users', labelKey: 'nav.users', icon: 'users', href: '/users', requires: ['users.manage'], keywords: ['employees', 'staff'] },
            { kind: 'link', id: 'employee-contract', labelKey: 'nav.hr.employeeContract', icon: 'hr-employee-contract', href: '/hr/employee-contract', requires: HR },
          ],
        },
        {
          id: 'hr-performance',
          labelKey: 'nav.sections.performance',
          items: [
            { kind: 'link', id: 'evaluations', labelKey: 'nav.hr.evaluations', icon: 'hr-employee-evaluation', href: '/hr/evaluations', requires: HR, activePaths: ['/hr/employee-evaluation'], keywords: ['performance', 'appraisal', 'review'] },
            { kind: 'link', id: 'evaluation-cycles', labelKey: 'nav.hr.evaluationCycles', icon: 'hr-employee-evaluation', href: '/hr/evaluations/cycles', requires: HR, keywords: ['quarter', 'cycle'] },
          ],
        },
        {
          id: 'hr-time-leave',
          labelKey: 'nav.sections.timeOff',
          items: [
            { kind: 'link', id: 'leave-requests', labelKey: 'nav.hr.leaveRequests', icon: 'hr-leave', href: '/hr/leave-requests', requires: ['leave.access'], activePaths: ['/hr/leave-history'], keywords: ['vacation', 'annual leave', 'sick'] },
            { kind: 'link', id: 'overtime', labelKey: 'nav.hr.overtime', icon: 'hr-overtime', href: '/hr/overtime', requires: ['overtime.access'], activePaths: ['/hr/overtime-history'], keywords: ['extra hours'] },
            { kind: 'link', id: 'attendance', labelKey: 'nav.hr.attendance', icon: 'hr-attendance', href: '/hr/attendance', requires: HR, keywords: ['clock in', 'deli', 'timesheet'] },
            { kind: 'link', id: 'field-movement-logs', labelKey: 'nav.hr.fieldMovementLogs', icon: 'hr-field-movement', href: '/hr/field-movement-logs', requires: HR, keywords: ['field visit', 'early departure', 'clock'] },
            { kind: 'link', id: 'work-schedules', labelKey: 'nav.hr.workSchedules', icon: 'hr-work-schedules', href: '/hr/work-schedules', requires: HR, keywords: ['shifts', 'roster'] },
            { kind: 'link', id: 'public-holidays', labelKey: 'nav.hr.publicHolidays', icon: 'hr-public-holidays', href: '/hr/public-holidays', requires: HR },
            { kind: 'link', id: 'leave-policy', labelKey: 'nav.hr.leavePolicy', icon: 'hr-leave-policy', href: '/hr/leave-policy', requires: HR },
          ],
        },
        {
          id: 'hr-travel-expenses',
          labelKey: 'nav.sections.travelExpenses',
          items: [
            { kind: 'link', id: 'expense-claims', labelKey: 'nav.hr.expenseClaims', icon: 'hr-expense', href: '/hr/expense-claims', requires: ['expenseClaims.access'], keywords: ['reimbursement'] },
            { kind: 'link', id: 'flight-applications', labelKey: 'nav.hr.flightApplications', icon: 'hr-flight', href: '/hr/flight-applications', requires: ['flight.access'], keywords: ['ticket', 'air'] },
            { kind: 'link', id: 'business-trips', labelKey: 'nav.hr.businessTrips', icon: 'hr-business-trip', href: '/hr/business-trips', requires: ['businessTrip.access'], keywords: ['travel'] },
            { kind: 'link', id: 'per-diem', labelKey: 'nav.hr.perDiem', icon: 'hr-per-diem', href: '/hr/per-diem', requires: HR, keywords: ['allowance'] },
            { kind: 'link', id: 'employee-per-diem-rates', labelKey: 'nav.hr.employeePerDiemRates', icon: 'hr-per-diem-rates', href: '/hr/employee-per-diem-rates', requires: ['perDiemRates.manage'] },
          ],
        },
        {
          id: 'hr-procurement',
          labelKey: 'nav.sections.procurement',
          items: [
            { kind: 'link', id: 'purchase-requests', labelKey: 'nav.hr.purchaseRequests', icon: 'hr-purchase', href: '/hr/purchase-requests', requires: ['procurement.access'], keywords: ['buy', 'order'] },
            { kind: 'link', id: 'material-requisition', labelKey: 'nav.hr.materialRequisition', icon: 'hr-material', href: '/hr/material-requisition', requires: ['procurement.access'], keywords: ['store', 'stock'] },
            { kind: 'link', id: 'consumables', labelKey: 'nav.hr.consumables', icon: 'hr-consumables', href: '/hr/consumables', requires: ['procurement.access'], keywords: ['supplies'] },
          ],
        },
        {
          id: 'hr-fleet-assets',
          labelKey: 'nav.sections.fleetAssets',
          items: [
            { kind: 'link', id: 'vehicle-applications', labelKey: 'nav.hr.vehicleApplications', icon: 'hr-vehicle', href: '/hr/vehicle-applications', requires: ['fleet.access'], keywords: ['car'] },
            { kind: 'link', id: 'vehicle-refueling', labelKey: 'nav.hr.vehicleRefueling', icon: 'hr-refueling', href: '/hr/vehicle-refueling', requires: ['fleet.access'], keywords: ['fuel'] },
            { kind: 'link', id: 'inspection-repair', labelKey: 'nav.hr.inspectionRepair', icon: 'hr-inspection', href: '/hr/inspection-repair', requires: ['fleet.access'], keywords: ['maintenance'] },
            { kind: 'link', id: 'company-asset', labelKey: 'nav.hr.companyAssets', icon: 'hr-company-asset', href: '/hr/company-asset', requires: ['fleet.access'], keywords: ['equipment'] },
          ],
        },
        {
          id: 'hr-administration',
          labelKey: 'nav.sections.admin',
          items: [
            { kind: 'link', id: 'official-seal', labelKey: 'nav.hr.officialSeal', icon: 'hr-official-seal', href: '/hr/official-seal', requires: ['administration.access'], keywords: ['stamp', 'chop'] },
            { kind: 'link', id: 'project-seal', labelKey: 'nav.hr.projectSeal', icon: 'hr-project-seal', href: '/hr/project-seal', requires: ['administration.access'], keywords: ['stamp', 'chop'] },
            { kind: 'link', id: 'exit-permit', labelKey: 'nav.hr.equipmentAndMaterialsExitPermit', icon: 'hr-equipment-and-materials-exit-permit', href: '/hr/equipment-and-materials-exit-permit', requires: ['administration.access'], keywords: ['gate pass'] },
            { kind: 'link', id: 'hr-reports', labelKey: 'nav.hr.reports', icon: 'hr-reports', href: '/hr/reports', requires: HR },
          ],
        },
      ],
    },
    {
      kind: 'folder',
      id: 'organization',
      labelKey: 'nav.groups.organization',
      shortLabelKey: 'nav.short.organization',
      icon: 'domain-organization',
      groups: [
        {
          id: 'org-structure',
          labelKey: 'nav.sections.structure',
          items: [
            { kind: 'link', id: 'departments', labelKey: 'nav.departments', icon: 'departments', href: '/departments', requires: ['org.departments'] },
            { kind: 'link', id: 'positions', labelKey: 'nav.positions', icon: 'positions', href: '/positions', requires: ['org.positions'], keywords: ['job titles'] },
            { kind: 'link', id: 'disciplines', labelKey: 'nav.disciplinesCatalog', icon: 'disciplines-catalog', href: '/disciplines', requires: ['org.disciplines'] },
          ],
        },
        {
          id: 'org-fleet',
          labelKey: 'nav.sections.companyFleet',
          items: [
            { kind: 'link', id: 'company-vehicles', labelKey: 'nav.organization.vehicles', icon: 'hr-vehicle', href: '/organization/vehicles', requires: ['org.vehicles'] },
          ],
        },
      ],
    },
  ],
  utility: [
    { kind: 'link', id: 'approvals', labelKey: 'nav.approvals', icon: 'approvals', href: '/approvals', requires: ['approvals.view'], badge: 'pendingApprovals', keywords: ['inbox', 'pending'] },
    // Every signed-in user can open their own profile — no permission.
    { kind: 'link', id: 'my-profile', labelKey: 'nav.myProfile', icon: 'my-profile', href: '/profile', activePaths: ['/hr/leave-history/me', '/hr/overtime-history/me'], keywords: ['account', 'password', 'personal', 'me'] },
    { kind: 'link', id: 'audit-logs', labelKey: 'nav.auditLogs', shortLabelKey: 'nav.short.auditLogs', icon: 'audit-logs', href: '/audit-logs', requires: ['audit.view'], keywords: ['history'] },
    { kind: 'link', id: 'settings', labelKey: 'nav.settings', icon: 'settings', href: '/settings', requires: ['settings.manage'], keywords: ['roles', 'permissions'] },
  ],
};
