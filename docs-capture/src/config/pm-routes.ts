/**
 * Mirrors frontend/lib/navigation/pm-app-routes.ts.
 * PM module is excluded from this docs release for every role.
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
  '/team',
  '/disciplines',
] as const;

export function isPmAppRoute(pathname: string): boolean {
  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  return PM_APP_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
