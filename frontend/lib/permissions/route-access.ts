import type { Capabilities } from '@/lib/api/types';
import { shouldRedirectPmRoute } from '@/lib/auth/session';

/**
 * Route-level access rules for the dashboard, shared by the page gate
 * (`RouteAccessGate`) and the breadcrumb trail so a link is never offered to a
 * page that would then refuse the user.
 *
 * These checks are UX, not security: the browser holds the session token, so
 * the Next.js server cannot verify permissions. Every data request is still
 * authorised by the NestJS API. Keep each rule in step with the API permission
 * that serves the page's data (and with `sidebar-permissions.ts`).
 *
 * Routes without a rule here are open to any signed-in user; their pages or
 * the API scope the data (e.g. /approvals, /profile, /announcements).
 */

/** Strips query/hash and trailing slashes. */
function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? '';
  return path.replace(/\/+$/, '') || '/';
}

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Employee self-service routes; pages and the API enforce record ownership. */
const HR_SELF_SERVICE_PREFIXES = [
  '/hr/overtime',
  '/hr/leave-requests',
  '/hr/leave-history',
  '/hr/employee-contract',
  '/hr/expense-claims',
  '/hr/per-diem',
  '/hr/attendance',
  '/hr/site-assignments',
  '/hr/evaluations',
] as const;

/** Supervisor team lists (data scoped to their reporting chain by the API). */
const HR_TEAM_PREFIXES = [
  '/hr/my-team',
  '/hr/flight-applications',
  '/hr/business-trips',
  '/hr/vehicle-applications',
  '/hr/equipment-and-materials-exit-permit',
  '/hr/field-movement-logs',
] as const;

/**
 * Whether the session may open a /hr/* route. Full HR (hr.view) can open
 * everything; other users only the self-service, team and module routes
 * their capabilities allow. Used by app/(dashboard)/hr/layout.tsx.
 */
export function isHrRouteAllowed(pathname: string, caps: Capabilities): boolean {
  const path = normalizePath(pathname);
  if (caps.canViewHr) {
    return true;
  }
  if (HR_SELF_SERVICE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  if (path.startsWith('/hr/work-from-home')) {
    return true;
  }
  const canViewTeam = caps.canViewHr || caps.hasDirectReports;
  if (canViewTeam && HR_TEAM_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  if (path.startsWith('/hr/payroll') && caps.canAccessPayroll) {
    return true;
  }
  if (path.startsWith('/hr/announcements') && caps.canManageAnnouncements) {
    return true;
  }
  if (
    path.startsWith('/hr/purchase-requests') &&
    (caps.canViewPurchaseRequest || caps.canCreatePurchaseRequest)
  ) {
    return true;
  }
  if (path.startsWith('/hr/id-cards') && caps.canManageUsers) {
    return true;
  }
  return false;
}

/** Settings (roles & permissions): hidden from HR, System Administrators keep it. */
export function isSettingsRouteAllowed(caps: Capabilities): boolean {
  return (
    (caps.canManageRoles || caps.canEditRoles) &&
    (!caps.canViewHr || caps.isSystemAdministrator)
  );
}

export interface RouteAccessContext {
  readonly capabilities: Capabilities;
  /** False until `/auth/capabilities` has loaded - every gated route is denied. */
  readonly ready: boolean;
}

/** Matches /users/:id/edit (not /users/new/...). */
const USER_EDIT_ROUTE = /^\/users\/[^/]+\/edit$/;

/**
 * Whether the session may open `pathname`. Returns true for routes with no
 * route-level rule.
 */
export function canAccessRoute(pathname: string, context: RouteAccessContext): boolean {
  const path = normalizePath(pathname);
  const caps = context.capabilities;

  if (!context.ready) {
    // Open routes stay open; anything gated waits for capabilities.
    return !isGatedRoute(path);
  }

  if (
    shouldRedirectPmRoute({
      pathname: path,
      pmModuleEnabled: caps.modulesProjectManagementEnabled,
      isSystemAdministrator: caps.isSystemAdministrator,
    })
  ) {
    return false;
  }

  if (matches(path, '/hr')) {
    return isHrRouteAllowed(path, caps);
  }
  if (matches(path, '/settings')) {
    return isSettingsRouteAllowed(caps);
  }
  // API: audit.view
  if (matches(path, '/audit-logs')) {
    return caps.canViewAuditLogs;
  }
  // API: users.create
  if (matches(path, '/users/new')) {
    return caps.canCreateUsers;
  }
  // API: users.edit
  if (USER_EDIT_ROUTE.test(path)) {
    return caps.canEditUsers;
  }
  // API: users.view (canManageUsers). /users/:id is opened from HR leave and
  // overtime pages too, so the detail page keeps its own in-page checks.
  if (path === '/users') {
    return caps.canManageUsers;
  }
  // Mirrors the sidebar's `org.vehicles` token.
  if (matches(path, '/organization/vehicles')) {
    return caps.canViewHr;
  }

  return true;
}

/** True when `canAccessRoute` applies a capability rule to this path. */
function isGatedRoute(path: string): boolean {
  return (
    matches(path, '/hr') ||
    matches(path, '/settings') ||
    matches(path, '/audit-logs') ||
    matches(path, '/users/new') ||
    USER_EDIT_ROUTE.test(path) ||
    path === '/users' ||
    matches(path, '/organization/vehicles') ||
    // PM routes depend on the module toggle.
    shouldRedirectPmRoute({
      pathname: path,
      pmModuleEnabled: false,
      isSystemAdministrator: false,
    })
  );
}
