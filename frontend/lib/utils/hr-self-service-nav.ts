/**
 * Safe in-app return paths for HR detail pages (self-service and manager views).
 */

const RETURN_TO_PREFIXES = [
  '/profile',
  '/users/',
  '/approvals',
  '/hr/overtime-history/',
] as const;

/**
 * Accepts only same-origin relative paths used as detail-page back targets.
 */
export function sanitizeReturnTo(
  raw: string | null | undefined,
): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return null;
  }
  const pathname = raw.split('?')[0] ?? raw;
  const allowed = RETURN_TO_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
  return allowed ? raw : null;
}

export function overtimeSheetDetailHref(
  sheetId: string,
  returnTo: string,
): string {
  return `/hr/overtime/${encodeURIComponent(sheetId)}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function resolveOvertimeDetailBackHref(options: {
  canViewHr: boolean;
  currentUserId: string | undefined;
  sheetEmployeeId: string | undefined;
  returnTo: string | null;
}): string {
  const fromQuery = sanitizeReturnTo(options.returnTo);
  if (fromQuery) {
    return fromQuery;
  }
  if (options.canViewHr) {
    return '/hr/overtime';
  }
  if (
    options.currentUserId &&
    options.sheetEmployeeId &&
    options.sheetEmployeeId !== options.currentUserId
  ) {
    return `/users/${encodeURIComponent(options.sheetEmployeeId)}?tab=leave`;
  }
  return '/profile?tab=overtime';
}

export function leaveRequestDetailHref(
  requestId: string,
  returnTo: string,
): string {
  return `/hr/leave-requests/${encodeURIComponent(requestId)}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function resolveLeaveRequestDetailBackHref(options: {
  canViewHr: boolean;
  currentUserId: string | undefined;
  requestEmployeeId: string | undefined;
  returnTo: string | null;
}): string {
  const fromQuery = sanitizeReturnTo(options.returnTo);
  if (fromQuery) {
    return fromQuery;
  }
  if (options.canViewHr) {
    return '/hr/leave-requests';
  }
  if (
    options.currentUserId &&
    options.requestEmployeeId &&
    options.requestEmployeeId !== options.currentUserId
  ) {
    return `/users/${encodeURIComponent(options.requestEmployeeId)}?tab=leave`;
  }
  return '/profile?tab=leave';
}
