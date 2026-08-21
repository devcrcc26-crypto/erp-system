/**
 * Dedicated leave balance + history page (not the leave-requests list filter).
 */
export function leaveHistoryPath(employeeId: string): string {
  return `/hr/leave-history/${encodeURIComponent(employeeId)}`;
}

/**
 * Current user's leave balance + history page.
 */
export function myLeaveHistoryPath(): string {
  return '/hr/leave-history/me';
}
