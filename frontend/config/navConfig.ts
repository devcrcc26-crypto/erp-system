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
}

export interface BreadcrumbSegment {
  readonly label: string;
  readonly href?: string;
}

export interface RouteMeta {
  readonly titleKey: string;
  readonly breadcrumbs: readonly BreadcrumbSegment[];
}

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'nav.dashboard',
  '/projects': 'nav.projects',
  '/kanban-board': 'nav.kanbanBoard',
  '/review-inbox': 'pages.reviewInbox.title',
  '/my-comments': 'pages.myComments.title',
  '/my-work': 'pages.myWork.title',
  '/users': 'nav.users',
  '/teams': 'nav.teams',
  '/reports': 'nav.reports',
  '/messages': 'nav.messages',
  '/settings': 'nav.settings',
  '/profile': 'nav.profile',
  '/audit-logs': 'nav.auditLogs',
  '/departments': 'pages.departments.title',
  '/positions': 'pages.positions.title',
  '/disciplines': 'pages.disciplinesCatalog.title',
};

export interface IconRailVisibility {
  canViewReviewInbox: boolean;
  canViewMyComments: boolean;
  canViewMyWork: boolean;
  canViewAuditLogs: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  canViewProjects: boolean;
  canViewDepartments: boolean;
  canViewPositions: boolean;
  canViewDisciplinesCatalog: boolean;
}

/**
 * Top-level icon rail navigation items.
 */
export function buildIconRailItems(visibility: IconRailVisibility): IconRailItem[] {
  const {
    canViewReviewInbox,
    canViewMyComments,
    canViewMyWork,
    canViewAuditLogs,
    canManageUsers,
    canManageRoles,
    canViewProjects,
    canViewDepartments,
    canViewPositions,
    canViewDisciplinesCatalog,
  } = visibility;

  return [
    {
      key: '/',
      labelKey: 'nav.dashboard',
      href: '/',
      iconKey: 'dashboard',
      visible: true,
    },
    {
      key: '/projects',
      labelKey: 'nav.projects',
      href: '/projects',
      iconKey: 'projects',
      visible: canViewProjects,
    },
    {
      key: '/review-inbox',
      labelKey: 'nav.reviewInbox',
      href: '/review-inbox',
      iconKey: 'review-inbox',
      visible: canViewReviewInbox,
    },
    {
      key: '/my-comments',
      labelKey: 'nav.myComments',
      href: '/my-comments',
      iconKey: 'my-comments',
      visible: canViewMyComments,
    },
    {
      key: '/my-work',
      labelKey: 'nav.myWork',
      href: '/my-work',
      iconKey: 'my-work',
      visible: canViewMyWork,
    },
    {
      key: '/departments',
      labelKey: 'nav.departments',
      href: '/departments',
      iconKey: 'departments',
      visible: canViewDepartments,
    },
    {
      key: '/positions',
      labelKey: 'nav.positions',
      href: '/positions',
      iconKey: 'positions',
      visible: canViewPositions,
    },
    {
      key: '/disciplines',
      labelKey: 'nav.disciplinesCatalog',
      href: '/disciplines',
      iconKey: 'disciplines-catalog',
      visible: canViewDisciplinesCatalog,
    },
    {
      key: '/kanban-board',
      labelKey: 'nav.kanbanBoard',
      href: '/kanban-board',
      iconKey: 'kanban',
      visible: canViewProjects,
    },
    {
      key: '/users',
      labelKey: 'nav.users',
      href: '/users',
      iconKey: 'users',
      visible: canManageUsers,
    },
    {
      key: '/audit-logs',
      labelKey: 'nav.auditLogs',
      href: '/audit-logs',
      iconKey: 'audit-logs',
      visible: canViewAuditLogs,
    },
    {
      key: '/reports',
      labelKey: 'nav.reports',
      href: '/reports',
      iconKey: 'reports',
      visible: canViewProjects,
    },
    {
      key: '/messages',
      labelKey: 'nav.messages',
      href: '/messages',
      iconKey: 'messages',
      visible: false,
    },
    {
      key: '/settings',
      labelKey: 'nav.settings',
      href: '/settings',
      iconKey: 'settings',
      visible: canManageRoles,
    },
  ];
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

/**
 * Resolves the active icon rail key from the current pathname.
 */
export function resolveIconRailKey(
  pathname: string,
  visibleItems: IconRailItem[],
): string {
  if (pathname === '/profile') {
    return '/profile';
  }

  const match = visibleItems.find(
    (item) => item.href !== '/' && pathname.startsWith(item.href),
  );
  return match?.key ?? '/';
}

/**
 * Route-driven page title key and breadcrumb segments.
 */
export function resolveRouteMeta(
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

  const titleKey = PAGE_TITLE_KEYS[pathname] ?? 'nav.dashboard';

  if (pathname === '/') {
    return {
      titleKey,
      breadcrumbs: [{ label: t(titleKey) }],
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
