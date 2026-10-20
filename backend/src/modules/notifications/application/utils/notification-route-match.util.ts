const ROUTE_MATCH_BASE = 'http://erp.local';

/**
 * Normalises an app path (pathname + optional query) for comparison.
 */
export function normalizeAppRoutePath(path: string): string {
  const trimmed = path.trim();
  const url = new URL(trimmed, ROUTE_MATCH_BASE);
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return `${pathname}${url.search}`;
}

/**
 * True when the user is on a route that satisfies the notification deep link.
 * Pathname must match; every query param on the notification link must match the current route.
 */
export function notificationLinkMatchesRoute(
  notificationLink: string,
  currentRoutePath: string,
): boolean {
  try {
    const linkUrl = new URL(notificationLink.trim(), ROUTE_MATCH_BASE);
    const currentUrl = new URL(
      currentRoutePath.trim(),
      ROUTE_MATCH_BASE,
    );

    let linkPath = linkUrl.pathname;
    let currentPath = currentUrl.pathname;
    if (linkPath.length > 1 && linkPath.endsWith('/')) {
      linkPath = linkPath.slice(0, -1);
    }
    if (currentPath.length > 1 && currentPath.endsWith('/')) {
      currentPath = currentPath.slice(0, -1);
    }
    if (linkPath !== currentPath) {
      return false;
    }

    for (const [key, value] of linkUrl.searchParams.entries()) {
      if (currentUrl.searchParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
