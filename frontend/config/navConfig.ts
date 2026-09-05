import type { ReactNode } from 'react';
import {
  resolveProjectBreadcrumb,
  resolveProjectNavKey,
  flattenProjectNavItems,
  projectNavHref,
  PROJECT_WORKSPACE_NAV,
  type ProjectWorkspaceNavGroup,
} from '@/lib/navigation/project-workspace-nav';

export type { ProjectWorkspaceNavGroup };

export interface IconRailItem {
  readonly key: string;
  readonly labelKey: string;
  readonly href: string;
  readonly iconKey: string;
  readonly visible: boolean;
  /** Optional badge count to display next to the nav item */
  readonly badge?: number;
  /** Optional subsection label i18n key within a domain panel */
  readonly sectionKey?: string;
}

export interface IconRailGroup {
  readonly key: string;
  readonly labelKey: string;
  /** Rail icon for the group's domain button. */
  readonly iconKey: string;
  readonly items: readonly IconRailItem[];
}

export interface IconRailNavStructure {
  /** Items rendered above collapsible groups (e.g. Dashboard). */
  readonly topItems: readonly IconRailItem[];
  readonly groups: readonly IconRailGroup[];
  readonly standalone: readonly IconRailItem[];
}

export interface BreadcrumbSegment {
  readonly label: string;
  readonly href?: string;
}

export interface RouteMeta {
  readonly titleKey: string;
  /** Optional i18n key for the top-bar subtitle under the page title. */
  readonly descriptionKey?: string;
  readonly breadcrumbs: readonly BreadcrumbSegment[];
}

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.dashboard',
  '/projects': 'nav.projects',
  '/kanban-board': 'nav.kanbanBoard',
  '/review-inbox': 'pages.reviewInbox.title',
  '/my-comments': 'pages.myComments.title',
  '/my-work': 'pages.myWork.title',
  '/submittals': 'nav.submittals',
  '/external-releases': 'nav.externalReleases',
  '/change-requests': 'nav.changeRequests',
  '/rfis': 'nav.rfis',
  '/issues': 'nav.issues',
  '/risks': 'nav.risks',
  '/punch-list': 'nav.punchList',
  '/correspondence': 'nav.correspondence',
  '/daily-logs': 'nav.dailyLogs',
  '/approvals': 'pages.approvals.listTitle',
  '/users': 'nav.users',
  '/users/new': 'pages.users.new',
  '/teams': 'nav.teams',
  '/reports': 'nav.reports',
  '/messages': 'nav.messages',
  '/settings': 'nav.settings',
  '/profile': 'nav.profile',
  '/notifications': 'nav.notifications',
  '/audit-logs': 'nav.auditLogs',
  '/departments': 'pages.departments.title',
  '/positions': 'pages.positions.title',
  '/disciplines': 'pages.disciplinesCatalog.title',
  '/hr/leave-requests': 'nav.hr.leaveRequests',
  '/hr/leave-history/me': 'pages.hr.leaveHistory.myTitle',
  '/hr/overtime-history/me': 'pages.hr.overtimeHistory.myTitle',
  '/hr/overtime': 'nav.hr.overtime',
  '/hr/expense-claims': 'nav.hr.expenseClaims',
  '/hr/purchase-requests': 'nav.hr.purchaseRequests',
  '/hr/material-requisition': 'nav.hr.materialRequisition',
  '/hr/consumables': 'nav.hr.consumables',
  '/hr/flight-applications': 'nav.hr.flightApplications',
  '/hr/vehicle-applications': 'nav.hr.vehicleApplications',
  '/hr/official-seal': 'pages.hr.officialSeal.listTitle',
  '/hr/project-seal': 'pages.hr.projectSeal.listTitle',
  '/hr/official-seal-requests': 'nav.hr.officialSealRequests',
  '/hr/vehicle-refueling': 'nav.hr.vehicleRefueling',
  '/hr/employee-contract': 'nav.hr.employeeContract',
  '/hr/employee-contract/new': 'pages.hr.employeeContract.new',
  '/organization/vehicles': 'nav.organization.vehicles',
  '/organization/vehicles/new': 'pages.organization.vehicles.new',
  '/hr/inspection-repair': 'pages.hr.inspectionRepair.listTitle',
  '/hr/business-trips': 'nav.hr.businessTrips',
  '/hr/reports': 'nav.hr.reports',
  '/hr/per-diem': 'nav.hr.perDiem',
  '/hr/employee-per-diem-rates': 'pages.hr.employeePerDiemRates.listTitle',
  '/hr/leave-policy': 'pages.hr.leavePolicy.listTitle',
  '/hr/leave-policy/new': 'pages.hr.leavePolicy.new',
  '/hr/company-asset': 'nav.hr.companyAssets',
  '/hr/company-asset/new': 'pages.hr.companyAsset.new',
  '/hr/asset-management': 'nav.hr.assetManagement',
  '/hr/attendance': 'nav.hr.attendance',
  '/hr/employee-evaluation': 'nav.hr.employeeEvaluation',
  '/hr/equipment-and-materials-exit-permit': 'pages.hr.exitPermit.listTitle',
  '/hr/equipment-and-materials-exit-permit/new': 'pages.hr.exitPermit.new',
};

/** `/approvals/new/...` create forms → specific page title + HR list breadcrumb. */
const APPROVAL_NEW_ROUTE_META: Record<
  string,
  { titleKey: string; listHref: string; listLabelKey: string }
> = {
  '/approvals/new/overtime': {
    titleKey: 'pages.hr.overtime.new',
    listHref: '/hr/overtime',
    listLabelKey: 'nav.hr.overtime',
  },
  '/approvals/new/flight-application': {
    titleKey: 'pages.hr.flight.new',
    listHref: '/hr/flight-applications',
    listLabelKey: 'nav.hr.flightApplications',
  },
  '/approvals/new/business-trip': {
    titleKey: 'pages.hr.businessTrip.new',
    listHref: '/hr/business-trips',
    listLabelKey: 'nav.hr.businessTrips',
  },
  '/approvals/new/expense-claim': {
    titleKey: 'pages.hr.expenseClaim.new',
    listHref: '/hr/expense-claims',
    listLabelKey: 'nav.hr.expenseClaims',
  },
  '/approvals/new/per-diem': {
    titleKey: 'pages.hr.perDiem.new',
    listHref: '/hr/per-diem',
    listLabelKey: 'nav.hr.perDiem',
  },
  '/approvals/new/purchase-request': {
    titleKey: 'pages.hr.purchaseRequest.new',
    listHref: '/hr/purchase-requests',
    listLabelKey: 'nav.hr.purchaseRequests',
  },
  '/approvals/new/material-requisition': {
    titleKey: 'pages.hr.materialRequisition.new',
    listHref: '/hr/material-requisition',
    listLabelKey: 'nav.hr.materialRequisition',
  },
  '/approvals/new/equipment-and-materials-exit-permit': {
    titleKey: 'pages.hr.exitPermit.new',
    listHref: '/hr/equipment-and-materials-exit-permit',
    listLabelKey: 'nav.hr.equipmentAndMaterialsExitPermit',
  },
  '/approvals/new/exit-permit': {
    titleKey: 'pages.hr.exitPermit.new',
    listHref: '/hr/equipment-and-materials-exit-permit',
    listLabelKey: 'nav.hr.equipmentAndMaterialsExitPermit',
  },
  '/approvals/new/consumables': {
    titleKey: 'pages.hr.consumables.new',
    listHref: '/hr/consumables',
    listLabelKey: 'nav.hr.consumables',
  },
  '/approvals/new/vehicle-application': {
    titleKey: 'pages.hr.vehicleApplication.new',
    listHref: '/hr/vehicle-applications',
    listLabelKey: 'nav.hr.vehicleApplications',
  },
  '/approvals/new/vehicle-refueling': {
    titleKey: 'pages.hr.vehicleRefueling.new',
    listHref: '/hr/vehicle-refueling',
    listLabelKey: 'nav.hr.vehicleRefueling',
  },
  '/approvals/new/inspection-repair': {
    titleKey: 'pages.hr.inspectionRepair.new',
    listHref: '/hr/inspection-repair',
    listLabelKey: 'nav.hr.inspectionRepair',
  },
  '/approvals/new/official-seal': {
    titleKey: 'pages.hr.officialSeal.new',
    listHref: '/hr/official-seal',
    listLabelKey: 'nav.hr.officialSeal',
  },
  '/approvals/new/project-seal': {
    titleKey: 'pages.hr.projectSeal.new',
    listHref: '/hr/project-seal',
    listLabelKey: 'nav.hr.projectSeal',
  },
};

/** Route → page subtitle (description) i18n keys for MainContentHeader. */
const PAGE_DESCRIPTION_KEYS: Record<string, string> = {
  '/approvals': 'pages.approvals.listDescription',
  '/approvals/new': 'pages.approvals.newDescription',
  '/users': 'users.listDescription',
  '/users/new': 'users.form.addEmployeeDescription',
  '/departments': 'pages.departments.description',
  '/positions': 'pages.positions.description',
  '/disciplines': 'pages.disciplinesCatalog.description',
  '/hr/leave-requests': 'pages.hr.leave.listDescription',
  '/hr/leave-history/me': 'pages.hr.leaveHistory.myDescription',
  '/hr/overtime-history/me': 'pages.hr.overtimeHistory.myDescription',
  '/hr/overtime': 'pages.hr.overtime.listDescription',
  '/hr/expense-claims': 'pages.hr.expenseClaim.listDescription',
  '/hr/purchase-requests': 'pages.hr.purchaseRequest.listDescription',
  '/hr/material-requisition': 'pages.hr.materialRequisition.listDescription',
  '/hr/consumables': 'pages.hr.consumables.listDescription',
  '/hr/flight-applications': 'pages.hr.flight.listDescription',
  '/hr/vehicle-applications': 'pages.hr.vehicleApplication.listDescription',
  '/hr/official-seal': 'pages.hr.officialSeal.listDescription',
  '/hr/project-seal': 'pages.hr.projectSeal.listDescription',
  '/hr/vehicle-refueling': 'pages.hr.vehicleRefueling.listDescription',
  '/hr/employee-contract': 'pages.hr.employeeContract.listDescription',
  '/hr/employee-contract/new': 'pages.hr.employeeContract.formDescription',
  '/hr/inspection-repair': 'pages.hr.inspectionRepair.listDescription',
  '/hr/equipment-and-materials-exit-permit': 'pages.hr.exitPermit.listDescription',
  '/hr/business-trips': 'pages.hr.businessTrip.listDescription',
  '/hr/per-diem': 'pages.hr.perDiem.listDescription',
  '/hr/employee-per-diem-rates': 'pages.hr.employeePerDiemRates.listDescription',
  '/hr/leave-policy': 'pages.hr.leavePolicy.listDescription',
  '/hr/leave-policy/new': 'hr.leavePolicy.formDescription',
  '/hr/company-asset': 'pages.hr.companyAsset.listDescription',
  '/hr/company-asset/new': 'pages.hr.companyAsset.formDescription',
  '/audit-logs': 'auditLogs.description',
  '/organization/vehicles': 'vehicles.listDescription',
  '/organization/vehicles/new': 'vehicles.form.addDescription',
  '/approvals/new/leave-request': 'pages.hr.leave.detailsStepDescription',
  '/approvals/new/overtime': 'pages.hr.overtime.newDescription',
  '/approvals/new/flight-application': 'pages.hr.flight.formDescription',
  '/approvals/new/business-trip': 'pages.hr.businessTrip.formDescription',
  '/approvals/new/expense-claim': 'pages.hr.expenseClaim.formDescription',
  '/approvals/new/purchase-request': 'pages.hr.purchaseRequest.formDescription',
  '/approvals/new/material-requisition': 'pages.hr.materialRequisition.formDescription',
  '/approvals/new/equipment-and-materials-exit-permit': 'pages.hr.exitPermit.formDescription',
  '/approvals/new/consumables': 'pages.hr.consumables.formDescription',
  '/approvals/new/per-diem': 'pages.hr.perDiem.formDescription',
  '/approvals/new/vehicle-application': 'pages.hr.vehicleApplication.formDescription',
  '/approvals/new/vehicle-refueling': 'pages.hr.vehicleRefueling.formDescription',
  '/approvals/new/inspection-repair': 'pages.hr.inspectionRepair.formDescription',
  '/approvals/new/official-seal': 'pages.hr.officialSeal.formDescription',
  '/approvals/new/project-seal': 'pages.hr.projectSeal.formDescription',
  '/approvals/new/exit-permit': 'pages.hr.exitPermit.formDescription',
  
};

function descriptionKeyFor(pathname: string): string | undefined {
  return PAGE_DESCRIPTION_KEYS[pathname];
}

export interface IconRailVisibility {
  canViewReviewInbox: boolean;
  canViewMyComments: boolean;
  canViewMyWork: boolean;
  canViewSubmittals: boolean;
  canViewExternalReleases: boolean;
  canViewChangeRequests: boolean;
  canViewRfis: boolean;
  canViewIssues: boolean;
  canViewRisks: boolean;
  canViewPunchList: boolean;
  canViewMeetings: boolean;
  canViewCorrespondence: boolean;
  canViewDailyLogs: boolean;
  canViewApprovals: boolean;
  canViewHr: boolean;
  canViewAuditLogs: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canViewProjects: boolean;
  canViewDepartments: boolean;
  canViewPositions: boolean;
  canViewDisciplinesCatalog: boolean;
}

/**
 * Domain-grouped main navigation: PM + HR collapsible groups, plus standalone items.
 */
export function buildIconRailNav(
  visibility: IconRailVisibility,
): IconRailNavStructure {
  const {
    canViewReviewInbox,
    canViewMyComments,
    canViewMyWork,
    canViewSubmittals,
    canViewExternalReleases,
    canViewChangeRequests,
    canViewRfis,
    canViewIssues,
    canViewRisks,
    canViewPunchList,
    canViewMeetings,
    canViewCorrespondence,
    canViewDailyLogs,
    canViewApprovals,
    canViewHr,
    canViewAuditLogs,
    canManageUsers,
    canManageRoles,
    canViewProjects,
    canViewDepartments,
    canViewPositions,
    canViewDisciplinesCatalog,
  } = visibility;

  const topItems: IconRailItem[] = [
    {
      key: '/',
      labelKey: 'nav.dashboard',
      href: '/',
      iconKey: 'dashboard',
      visible: true,
    },
  ];

  const projectManagement: IconRailGroup = {
    key: 'pm',
    labelKey: 'nav.groups.projectManagement',
    iconKey: 'domain-projects',
    items: [
      {
        key: '/projects',
        labelKey: 'nav.projects',
        href: '/projects',
        iconKey: 'projects',
        visible: canViewProjects,
        sectionKey: 'nav.sections.workspace',
      },
      {
        key: '/review-inbox',
        labelKey: 'nav.reviewInbox',
        href: '/review-inbox',
        iconKey: 'review-inbox',
        visible: canViewReviewInbox,
        sectionKey: 'nav.sections.workspace',
      },
      {
        key: '/my-comments',
        labelKey: 'nav.myComments',
        href: '/my-comments',
        iconKey: 'my-comments',
        visible: canViewMyComments,
        sectionKey: 'nav.sections.workspace',
      },
      {
        key: '/my-work',
        labelKey: 'nav.myWork',
        href: '/my-work',
        iconKey: 'my-work',
        visible: canViewMyWork,
        sectionKey: 'nav.sections.workspace',
      },
      {
        key: '/kanban-board',
        labelKey: 'nav.kanbanBoard',
        href: '/kanban-board',
        iconKey: 'kanban',
        visible: canViewProjects,
        sectionKey: 'nav.sections.workspace',
      },
      {
        key: '/reports',
        labelKey: 'nav.reports',
        href: '/reports',
        iconKey: 'reports',
        visible: canViewProjects,
        sectionKey: 'nav.sections.workspace',
      },
      {
        key: '/submittals',
        labelKey: 'nav.submittals',
        href: '/submittals',
        iconKey: 'submittals',
        visible: canViewSubmittals,
        sectionKey: 'nav.sections.engineering',
      },
      {
        key: '/external-releases',
        labelKey: 'nav.externalReleases',
        href: '/external-releases',
        iconKey: 'external-release',
        visible: canViewExternalReleases,
        sectionKey: 'nav.sections.engineering',
      },
      {
        key: '/change-requests',
        labelKey: 'nav.changeRequests',
        href: '/change-requests',
        iconKey: 'change-requests',
        visible: canViewChangeRequests,
        sectionKey: 'nav.sections.engineering',
      },
      {
        key: '/rfis',
        labelKey: 'nav.rfis',
        href: '/rfis',
        iconKey: 'rfis',
        visible: canViewRfis,
        sectionKey: 'nav.sections.engineering',
      },
      {
        key: '/issues',
        labelKey: 'nav.issues',
        href: '/issues',
        iconKey: 'issues',
        visible: canViewIssues,
        sectionKey: 'nav.sections.siteOps',
      },
      {
        key: '/risks',
        labelKey: 'nav.risks',
        href: '/risks',
        iconKey: 'risks',
        visible: canViewRisks,
        sectionKey: 'nav.sections.siteOps',
      },
      {
        key: '/punch-list',
        labelKey: 'nav.punchList',
        href: '/punch-list',
        iconKey: 'punch-list',
        visible: canViewPunchList,
        sectionKey: 'nav.sections.siteOps',
      },
      {
        key: '/daily-logs',
        labelKey: 'nav.dailyLogs',
        href: '/daily-logs',
        iconKey: 'daily-logs',
        visible: canViewDailyLogs,
        sectionKey: 'nav.sections.siteOps',
      },
      {
        key: '/meetings',
        labelKey: 'nav.meetings',
        href: '/meetings',
        iconKey: 'meetings',
        visible: canViewMeetings,
        sectionKey: 'nav.sections.siteOps',
      },
      {
        key: '/correspondence',
        labelKey: 'nav.correspondence',
        href: '/correspondence',
        iconKey: 'correspondence',
        visible: canViewCorrespondence,
        sectionKey: 'nav.sections.siteOps',
      },
    ],
  };

  const humanResources: IconRailGroup = {
    key: 'hr',
    labelKey: 'nav.groups.humanResources',
    iconKey: 'domain-hr',
    items: [
      {
        key: '/users',
        labelKey: 'nav.users',
        href: '/users',
        iconKey: 'users',
        visible: canManageUsers,
        sectionKey: 'nav.sections.people',
      },
      {
        key: '/hr/employee-contract',
        labelKey: 'nav.hr.employeeContract',
        href: '/hr/employee-contract',
        iconKey: 'hr-employee-contract',
        visible: canViewHr,
        sectionKey: 'nav.sections.people',
      },
      {
        key: '/hr/attendance',
        labelKey: 'nav.hr.attendance',
        href: '/hr/attendance',
        iconKey: 'hr-attendance',
        visible: canViewHr,
        sectionKey: 'nav.sections.people',
      },
      {
        key: '/hr/employee-evaluation',
        labelKey: 'nav.hr.employeeEvaluation',
        href: '/hr/employee-evaluation',
        iconKey: 'hr-employee-evaluation',
        visible: canViewHr,
        sectionKey: 'nav.sections.people',
      },
      {
        key: '/hr/leave-requests',
        labelKey: 'nav.hr.leaveRequests',
        href: '/hr/leave-requests',
        iconKey: 'hr-leave',
        visible: canViewHr,
        sectionKey: 'nav.sections.timeOff',
      },
      {
        key: '/hr/overtime',
        labelKey: 'nav.hr.overtime',
        href: '/hr/overtime',
        iconKey: 'hr-overtime',
        visible: canViewHr,
        sectionKey: 'nav.sections.timeOff',
      },
      {
        key: '/hr/expense-claims',
        labelKey: 'nav.hr.expenseClaims',
        href: '/hr/expense-claims',
        iconKey: 'hr-expense',
        visible: canViewHr,
        sectionKey: 'nav.sections.travelExpenses',
      },
      {
        key: '/hr/flight-applications',
        labelKey: 'nav.hr.flightApplications',
        href: '/hr/flight-applications',
        iconKey: 'hr-flight',
        visible: canViewHr,
        sectionKey: 'nav.sections.travelExpenses',
      },
      {
        key: '/hr/business-trips',
        labelKey: 'nav.hr.businessTrips',
        href: '/hr/business-trips',
        iconKey: 'hr-business-trip',
        visible: canViewHr,
        sectionKey: 'nav.sections.travelExpenses',
      },
      {
        key: '/hr/per-diem',
        labelKey: 'nav.hr.perDiem',
        href: '/hr/per-diem',
        iconKey: 'hr-per-diem',
        visible: canViewHr,
        sectionKey: 'nav.sections.travelExpenses',
      },
      {
        key: '/hr/employee-per-diem-rates',
        labelKey: 'nav.hr.employeePerDiemRates',
        href: '/hr/employee-per-diem-rates',
        iconKey: 'hr-per-diem-rates',
        visible: canViewHr || canManageUsers,
        sectionKey: 'nav.sections.travelExpenses',
      },
      {
        key: '/hr/purchase-requests',
        labelKey: 'nav.hr.purchaseRequests',
        href: '/hr/purchase-requests',
        iconKey: 'hr-purchase',
        visible: canViewHr,
        sectionKey: 'nav.sections.procurement',
      },
      {
        key: '/hr/material-requisition',
        labelKey: 'nav.hr.materialRequisition',
        href: '/hr/material-requisition',
        iconKey: 'hr-material',
        visible: canViewHr,
        sectionKey: 'nav.sections.procurement',
      },
      {
        key: '/hr/consumables',
        labelKey: 'nav.hr.consumables',
        href: '/hr/consumables',
        iconKey: 'hr-consumables',
        visible: canViewHr,
        sectionKey: 'nav.sections.procurement',
      },
      {
        key: '/hr/vehicle-applications',
        labelKey: 'nav.hr.vehicleApplications',
        href: '/hr/vehicle-applications',
        iconKey: 'hr-vehicle',
        visible: canViewHr,
        sectionKey: 'nav.sections.fleetAssets',
      },
      {
        key: '/hr/vehicle-refueling',
        labelKey: 'nav.hr.vehicleRefueling',
        href: '/hr/vehicle-refueling',
        iconKey: 'hr-refueling',
        visible: canViewHr,
        sectionKey: 'nav.sections.fleetAssets',
      },
      {
        key: '/hr/company-asset',
        labelKey: 'nav.hr.companyAssets',
        href: '/hr/company-asset',
        iconKey: 'hr-company-asset',
        visible: canViewHr,
        sectionKey: 'nav.sections.fleetAssets',
      },
      {
        key: '/hr/inspection-repair',
        labelKey: 'nav.hr.inspectionRepair',
        href: '/hr/inspection-repair',
        iconKey: 'hr-inspection',
        visible: canViewHr,
        sectionKey: 'nav.sections.fleetAssets',
      },
      {
        key: '/hr/equipment-and-materials-exit-permit',
        labelKey: 'nav.hr.equipmentAndMaterialsExitPermit',
        href: '/hr/equipment-and-materials-exit-permit',
        iconKey: 'hr-equipment-and-materials-exit-permit',
        visible: canViewHr,
        sectionKey: 'nav.sections.fleetAssets',
      },
      {
        key: '/hr/official-seal',
        labelKey: 'nav.hr.officialSeal',
        href: '/hr/official-seal',
        iconKey: 'hr-official-seal',
        visible: canViewHr,
        sectionKey: 'nav.sections.admin',
      },
      {
        key: '/hr/project-seal',
        labelKey: 'nav.hr.projectSeal',
        href: '/hr/project-seal',
        iconKey: 'hr-project-seal',
        visible: canViewHr,
        sectionKey: 'nav.sections.admin',
      },
      {
        key: '/hr/reports',
        labelKey: 'nav.hr.reports',
        href: '/hr/reports',
        iconKey: 'hr-reports',
        visible: canViewHr,
        sectionKey: 'nav.sections.admin',
      },
      {
        key: '/hr/leave-policy',
        labelKey: 'nav.hr.leavePolicy',
        href: '/hr/leave-policy',
        iconKey: 'hr-leave-policy',
        visible: canViewHr,
        sectionKey: 'nav.sections.setup',
      },
    ],
  };

  const organization: IconRailGroup = {
    key: 'organization',
    labelKey: 'nav.groups.organization',
    iconKey: 'domain-organization',
    items: [
      {
        key: '/departments',
        labelKey: 'nav.departments',
        href: '/departments',
        iconKey: 'departments',
        visible: canViewDepartments,
        sectionKey: 'nav.sections.structure',
      },
      {
        key: '/positions',
        labelKey: 'nav.positions',
        href: '/positions',
        iconKey: 'positions',
        visible: canViewPositions,
        sectionKey: 'nav.sections.structure',
      },
      {
        key: '/disciplines',
        labelKey: 'nav.disciplinesCatalog',
        href: '/disciplines',
        iconKey: 'disciplines-catalog',
        visible: canViewDisciplinesCatalog,
        sectionKey: 'nav.sections.structure',
      },
      {
        key: '/organization/vehicles',
        labelKey: 'nav.organization.vehicles',
        href: '/organization/vehicles',
        iconKey: 'hr-vehicle',
        visible: canViewHr,
        sectionKey: 'nav.sections.companyFleet',
      },
    ],
  };

  const standalone: IconRailItem[] = [
    {
      key: '/approvals',
      labelKey: 'nav.approvals',
      href: '/approvals',
      iconKey: 'approvals',
      visible: canViewApprovals,
    },
    {
      key: '/audit-logs',
      labelKey: 'nav.auditLogs',
      href: '/audit-logs',
      iconKey: 'audit-logs',
      visible: canViewAuditLogs,
    },
    {
      key: '/settings',
      labelKey: 'nav.settings',
      href: '/settings',
      iconKey: 'settings',
      visible: canManageRoles,
    },
  ];

  const showOrganization =
    canViewDepartments ||
    canViewPositions ||
    canViewDisciplinesCatalog ||
    canViewHr;

  return {
    topItems,
    groups: [
      projectManagement,
      ...(canViewHr || canManageUsers ? [humanResources] : []),
      ...(showOrganization ? [organization] : []),
    ],
    standalone,
  };
}

/**
 * Flat list of all rail items (top, groups, then standalone) for active-key resolution.
 */
export function flattenIconRailNav(
  structure: IconRailNavStructure,
): IconRailItem[] {
  return [
    ...structure.topItems,
    ...structure.groups.flatMap((group) => group.items),
    ...structure.standalone,
  ];
}

/**
 * @deprecated Prefer `buildIconRailNav` + `flattenIconRailNav`.
 */
export function buildIconRailItems(
  visibility: IconRailVisibility,
): IconRailItem[] {
  return flattenIconRailNav(buildIconRailNav(visibility));
}

/** Context sidebar section config - sourced from project workspace nav. */
export const contextNavSections: readonly ProjectWorkspaceNavGroup[] =
  PROJECT_WORKSPACE_NAV;

export { projectNavHref, resolveProjectNavKey, flattenProjectNavItems };

const PROJECT_ID_PATTERN = /^\/projects\/([^/]+)/;

/**
 * Extracts project id from a pathname when on a project route.
 */
export function extractProjectId(pathname: string): string | null {
  const match = PROJECT_ID_PATTERN.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * Whether the context (project) sidebar should render for this route.
 */
export function shouldShowContextSidebar(pathname: string): boolean {
  return extractProjectId(pathname) !== null;
}

function pathMatchesHref(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Resolves the active icon rail key from the current pathname.
 */
export function resolveIconRailKey(
  pathname: string,
  visibleItems: IconRailItem[],
): string {
  if (pathname === '/profile' || pathname === '/hr/leave-history/me' || pathname === '/hr/overtime-history/me') {
    return '/profile';
  }

  if (pathname.startsWith('/hr/leave-history/')) {
    return '/hr/leave-requests';
  }

  if (pathname.startsWith('/hr/overtime-history/')) {
    return '/hr/overtime';
  }

  let best: IconRailItem | undefined;
  for (const item of visibleItems) {
    if (!pathMatchesHref(pathname, item.href)) {
      continue;
    }
    if (!best || item.href.length > best.href.length) {
      best = item;
    }
  }

  return best?.key ?? '/';
}

/**
 * Route-driven page title key, optional subtitle key, and breadcrumb segments.
 */
export function resolveRouteMeta(
  pathname: string,
  projectName: string | null,
  t: (key: string) => string,
): RouteMeta {
  const meta = resolveRouteMetaCore(pathname, projectName, t);
  return {
    ...meta,
    descriptionKey: meta.descriptionKey ?? descriptionKeyFor(pathname),
  };
}

function resolveRouteMetaCore(
  pathname: string,
  projectName: string | null,
  t: (key: string) => string,
): RouteMeta {
  const projectId = extractProjectId(pathname);

  if (projectId) {
    const projectCrumb = projectName ?? t('nav.projects');
    const projectHref = `/projects/${projectId}`;
    const breadcrumb = resolveProjectBreadcrumb(pathname, projectId);

    if (breadcrumb) {
      return {
        titleKey: breadcrumb.pageKey,
        breadcrumbs: [
          { label: t('nav.projects'), href: '/projects' },
          { label: projectCrumb, href: projectHref },
          { label: t(breadcrumb.groupKey) },
          { label: t(breadcrumb.pageKey) },
        ],
      };
    }

    return {
      titleKey: 'nav.dashboard',
      breadcrumbs: [
        { label: t('nav.projects'), href: '/projects' },
        { label: projectCrumb },
      ],
    };
  }

  if (pathname.startsWith('/design-packages')) {
    return {
      titleKey: 'pages.reviewMode.title',
      breadcrumbs: [
        { label: t('nav.projects'), href: '/projects' },
        { label: t('pages.reviewMode.title') },
      ],
    };
  }

  if (
    pathname === '/approvals/new/leave-request'
  ) {
    return {
      titleKey: 'pages.hr.leave.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        { label: t('pages.hr.leave.new') },
      ],
    };
  }

  const approvalNewMeta = APPROVAL_NEW_ROUTE_META[pathname];
  if (approvalNewMeta) {
    return {
      titleKey: approvalNewMeta.titleKey,
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t(approvalNewMeta.listLabelKey),
          href: approvalNewMeta.listHref,
        },
        { label: t(approvalNewMeta.titleKey) },
      ],
    };
  }

  if (pathname === '/approvals') {
    return {
      titleKey: 'pages.approvals.listTitle',
      descriptionKey: 'pages.approvals.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('pages.approvals.listTitle') },
      ],
    };
  }

  if (pathname === '/approvals/new') {
    return {
      titleKey: 'pages.approvals.new',
      descriptionKey: 'pages.approvals.newDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.approvals.listTitle'),
          href: '/approvals',
        },
        { label: t('pages.approvals.new') },
      ],
    };
  }

  if (pathname.startsWith('/approvals/')) {
    return {
      titleKey: 'pages.approvals.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.approvals.listTitle'),
          href: '/approvals',
        },
        { label: t('pages.approvals.detail') },
      ],
    };
  }

  if (pathname === '/hr/leave-policy') {
    return {
      titleKey: 'pages.hr.leavePolicy.listTitle',
      descriptionKey: 'pages.hr.leavePolicy.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.leavePolicy.listTitle') },
      ],
    };
  }

  if (pathname === '/hr/leave-policy/new') {
    return {
      titleKey: 'pages.hr.leavePolicy.new',
      descriptionKey: 'hr.leavePolicy.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.leavePolicy.listTitle'),
          href: '/hr/leave-policy',
        },
        { label: t('pages.hr.leavePolicy.new') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/leave-policy\/[^/]+\/edit$/)) {
    const id = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.leavePolicy.edit',
      descriptionKey: 'hr.leavePolicy.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.leavePolicy.listTitle'),
          href: '/hr/leave-policy',
        },
        {
          label: t('pages.hr.leavePolicy.detail'),
          href: id ? `/hr/leave-policy/${id}` : undefined,
        },
        { label: t('pages.hr.leavePolicy.edit') },
      ],
    };
  }

  if (pathname.match(/^\/hr\/leave-policy\/[^/]+$/)) {
    return {
      titleKey: 'pages.hr.leavePolicy.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.leavePolicy.listTitle'),
          href: '/hr/leave-policy',
        },
        { label: t('pages.hr.leavePolicy.detail') },
      ],
    };
  }

  if (pathname === '/hr/leave-history/me') {
    return {
      titleKey: 'pages.hr.leaveHistory.myTitle',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.profile'), href: '/profile' },
        { label: t('pages.hr.leaveHistory.myTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/leave-history/')) {
    return {
      titleKey: 'pages.hr.leaveHistory.title',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        { label: t('pages.hr.leaveHistory.title') },
      ],
    };
  }

  if (pathname === '/hr/overtime-history/me') {
    return {
      titleKey: 'pages.hr.overtimeHistory.myTitle',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.profile'), href: '/profile' },
        { label: t('pages.hr.overtimeHistory.myTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/overtime-history/')) {
    return {
      titleKey: 'pages.hr.overtimeHistory.title',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.overtime'), href: '/hr/overtime' },
        { label: t('pages.hr.overtimeHistory.title') },
      ],
    };
  }

  if (pathname.startsWith('/hr/leave-requests/')) {
    return {
      titleKey: 'pages.hr.leave.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.leaveRequests'), href: '/hr/leave-requests' },
        { label: t('pages.hr.leave.detail') },
      ],
    };
  }

  if (pathname === '/users/new') {
    return {
      titleKey: 'pages.users.new',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.users'), href: '/users' },
        { label: t('pages.users.new') },
      ],
    };
  }

  const usersEditMatch = /^\/users\/([^/]+)\/edit$/.exec(pathname);
  if (usersEditMatch) {
    const userId = usersEditMatch[1];
    return {
      titleKey: 'pages.users.edit',
      descriptionKey: 'users.form.editEmployeeDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.users'), href: '/users' },
        { label: t('pages.users.detail'), href: `/users/${userId}` },
        { label: t('pages.users.edit') },
      ],
    };
  }

  const usersDetailMatch = /^\/users\/([^/]+)$/.exec(pathname);
  if (usersDetailMatch) {
    return {
      titleKey: 'pages.users.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.users'), href: '/users' },
        { label: t('pages.users.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/overtime/')) {
    return {
      titleKey: 'pages.hr.overtime.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.overtime'), href: '/hr/overtime' },
        { label: t('pages.hr.overtime.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/flight-applications/')) {
    return {
      titleKey: 'pages.hr.flight.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.flightApplications'),
          href: '/hr/flight-applications',
        },
        { label: t('pages.hr.flight.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/business-trips/')) {
    return {
      titleKey: 'pages.hr.businessTrip.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.businessTrips'),
          href: '/hr/business-trips',
        },
        { label: t('pages.hr.businessTrip.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/expense-claims/')) {
    return {
      titleKey: 'pages.hr.expenseClaim.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.expenseClaims'), href: '/hr/expense-claims' },
        { label: t('pages.hr.expenseClaim.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-per-diem-rates/')) {
    return {
      titleKey: 'pages.hr.employeePerDiemRates.listTitle',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeePerDiemRates'),
          href: '/hr/employee-per-diem-rates',
        },
        { label: t('pages.hr.employeePerDiemRates.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/purchase-requests/')) {
    return {
      titleKey: 'pages.hr.purchaseRequest.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.purchaseRequests'),
          href: '/hr/purchase-requests',
        },
        { label: t('pages.hr.purchaseRequest.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/material-requisition/')) {
    return {
      titleKey: 'pages.hr.materialRequisition.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.materialRequisition'),
          href: '/hr/material-requisition',
        },
        { label: t('pages.hr.materialRequisition.detail') },
      ],
    };
  }

  if (pathname === '/hr/equipment-and-materials-exit-permit') {
    return {
      titleKey: 'pages.hr.exitPermit.listTitle',
      descriptionKey: 'pages.hr.exitPermit.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.exitPermit.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/equipment-and-materials-exit-permit/')) {
    return {
      titleKey: 'pages.hr.exitPermit.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.exitPermit.listTitle'),
          href: '/hr/equipment-and-materials-exit-permit',
        },
        { label: t('pages.hr.exitPermit.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/consumables/')) {
    return {
      titleKey: 'pages.hr.consumables.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.consumables'),
          href: '/hr/consumables',
        },
        { label: t('pages.hr.consumables.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/vehicle-applications/')) {
    return {
      titleKey: 'pages.hr.vehicleApplication.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.vehicleApplications'),
          href: '/hr/vehicle-applications',
        },
        { label: t('pages.hr.vehicleApplication.detail') },
      ],
    };
  }

  if (pathname === '/hr/employee-contract/new') {
    return {
      titleKey: 'pages.hr.employeeContract.new',
      descriptionKey: 'pages.hr.employeeContract.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeeContract'),
          href: '/hr/employee-contract',
        },
        { label: t('pages.hr.employeeContract.new') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-contract/') && pathname.endsWith('/edit')) {
    return {
      titleKey: 'pages.hr.employeeContract.edit',
      descriptionKey: 'pages.hr.employeeContract.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeeContract'),
          href: '/hr/employee-contract',
        },
        { label: t('pages.hr.employeeContract.edit') },
      ],
    };
  }

  if (pathname.startsWith('/hr/employee-contract/')) {
    return {
      titleKey: 'pages.hr.employeeContract.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.employeeContract'),
          href: '/hr/employee-contract',
        },
        { label: t('pages.hr.employeeContract.detail') },
      ],
    };
  }

  if (pathname.startsWith('/hr/vehicle-refueling/')) {
    return {
      titleKey: 'pages.hr.vehicleRefueling.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.vehicleRefueling'),
          href: '/hr/vehicle-refueling',
        },
        { label: t('pages.hr.vehicleRefueling.detail') },
      ],
    };
  }

  if (pathname === '/hr/inspection-repair') {
    return {
      titleKey: 'pages.hr.inspectionRepair.listTitle',
      descriptionKey: 'pages.hr.inspectionRepair.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.inspectionRepair.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/inspection-repair/')) {
    return {
      titleKey: 'pages.hr.inspectionRepair.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.inspectionRepair'),
          href: '/hr/inspection-repair',
        },
        { label: t('pages.hr.inspectionRepair.detail') },
      ],
    };
  }

  if (pathname.startsWith('/audit-logs/')) {
    return {
      titleKey: 'pages.auditLogs.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.auditLogs'), href: '/audit-logs' },
        { label: t('pages.auditLogs.detail') },
      ],
    };
  }

  if (pathname.startsWith('/organization/vehicles')) {
    if (pathname === '/organization/vehicles/new') {
      return {
        titleKey: 'pages.organization.vehicles.new',
        descriptionKey: 'vehicles.form.addDescription',
        breadcrumbs: [
          { label: t('nav.dashboard'), href: '/' },
          { label: t('nav.organization.vehicles'), href: '/organization/vehicles' },
          { label: t('pages.organization.vehicles.new') },
        ],
      };
    }

    const vehiclesEditMatch = /^\/organization\/vehicles\/([^/]+)\/edit$/.exec(
      pathname,
    );
    if (vehiclesEditMatch) {
      const vehicleId = vehiclesEditMatch[1];
      return {
        titleKey: 'pages.organization.vehicles.edit',
        descriptionKey: 'vehicles.form.editDescription',
        breadcrumbs: [
          { label: t('nav.dashboard'), href: '/' },
          { label: t('nav.organization.vehicles'), href: '/organization/vehicles' },
          {
            label: t('pages.organization.vehicles.detail'),
            href: `/organization/vehicles/${vehicleId}`,
          },
          { label: t('pages.organization.vehicles.edit') },
        ],
      };
    }

    const vehiclesDetailMatch = /^\/organization\/vehicles\/([^/]+)$/.exec(pathname);
    if (vehiclesDetailMatch) {
      return {
        titleKey: 'pages.organization.vehicles.detail',
        breadcrumbs: [
          { label: t('nav.dashboard'), href: '/' },
          { label: t('nav.organization.vehicles'), href: '/organization/vehicles' },
          { label: t('pages.organization.vehicles.detail') },
        ],
      };
    }

    return {
      titleKey: 'nav.organization.vehicles',
      descriptionKey: 'vehicles.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.organization') },
        { label: t('nav.organization.vehicles') },
      ],
    };
  }

  if (pathname.startsWith('/hr/per-diem/')) {
    return {
      titleKey: 'pages.hr.perDiem.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.hr.perDiem'), href: '/hr/per-diem' },
        { label: t('pages.hr.perDiem.detail') },
      ],
    };
  }
  if (pathname === '/hr/official-seal') {
    return {
      titleKey: 'pages.hr.officialSeal.listTitle',
      descriptionKey: 'pages.hr.officialSeal.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.officialSeal.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/official-seal/')) {
    return {
      titleKey: 'pages.hr.officialSeal.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.officialSeal.listTitle'),
          href: '/hr/official-seal',
        },
        { label: t('pages.hr.officialSeal.detail') },
      ],
    };
  }

  if (pathname === '/hr/project-seal') {
    return {
      titleKey: 'pages.hr.projectSeal.listTitle',
      descriptionKey: 'pages.hr.projectSeal.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.projectSeal.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/project-seal/')) {
    return {
      titleKey: 'pages.hr.projectSeal.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('pages.hr.projectSeal.listTitle'),
          href: '/hr/project-seal',
        },
        { label: t('pages.hr.projectSeal.detail') },
      ],
    };
  }

  if (pathname === '/hr/company-asset/new') {
    return {
      titleKey: 'pages.hr.companyAsset.new',
      descriptionKey: 'pages.hr.companyAsset.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.companyAssets'),
          href: '/hr/company-asset',
        },
        { label: t('pages.hr.companyAsset.new') },
      ],
    };
  }

  if (pathname.startsWith('/hr/company-asset/') && pathname.endsWith('/edit')) {
    const assetId = pathname.split('/')[3];
    return {
      titleKey: 'pages.hr.companyAsset.edit',
      descriptionKey: 'pages.hr.companyAsset.formDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.companyAssets'),
          href: '/hr/company-asset',
        },
        {
          label: t('pages.hr.companyAsset.detail'),
          href: assetId ? `/hr/company-asset/${assetId}` : undefined,
        },
        { label: t('pages.hr.companyAsset.edit') },
      ],
    };
  }

  if (pathname.startsWith('/hr/company-asset/')) {
    return {
      titleKey: 'pages.hr.companyAsset.detail',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        {
          label: t('nav.hr.companyAssets'),
          href: '/hr/company-asset',
        },
        { label: t('pages.hr.companyAsset.detail') },
      ],
    };
  }

  if (pathname === '/hr/company-asset') {
    return {
      titleKey: 'pages.hr.companyAsset.listTitle',
      descriptionKey: 'pages.hr.companyAsset.listDescription',
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t('pages.hr.companyAsset.listTitle') },
      ],
    };
  }

  if (pathname.startsWith('/hr/')) {
    const titleKey = PAGE_TITLE_KEYS[pathname] ?? 'nav.groups.humanResources';
    return {
      titleKey,
      breadcrumbs: [
        { label: t('nav.dashboard'), href: '/' },
        { label: t('nav.groups.humanResources') },
        { label: t(titleKey) },
      ],
    };
  }

  const titleKey = PAGE_TITLE_KEYS[pathname] ?? 'nav.dashboard';

  if (pathname === '/') {
    return {
      titleKey,
      breadcrumbs: [],
    };
  }

  return {
    titleKey,
    breadcrumbs: [
      { label: t('nav.dashboard'), href: '/' },
      { label: t(titleKey) },
    ],
  };
}

/** @deprecated Import `getNavIcon` from `@/lib/navigation/nav-icons` instead. */
export type NavIconRenderer = (iconKey: string) => ReactNode;
