/**
 * App Router paths served by the project-management module.
 * Used by middleware to block navigation when PM is disabled.
 */
export const PM_APP_ROUTE_PREFIXES = [
  '/projects',
  '/submittals',
  '/review-inbox',
  '/my-comments',
  '/my-work',
  '/kanban-board',
  '/reports',
  '/external-releases',
  '/change-requests',
  '/rfis',
  '/issues',
  '/risks',
  '/punch-list',
  '/daily-logs',
  '/meetings',
  '/correspondence',
  '/design-packages',
] as const;

/** True when pathname is a PM page (exact or nested). */
export function isPmAppRoute(pathname: string): boolean {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  return PM_APP_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
