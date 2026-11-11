/**
 * Dedicated overtime hours + sheet history page (not the overtime list filter).
 */
export function overtimeHistoryPath(employeeId: string): string {
  return `/hr/overtime-history/${encodeURIComponent(employeeId)}`;
}

/**
 * Current user's overtime hours + sheet history page.
 */
export function myOvertimeHistoryPath(): string {
  return '/hr/overtime-history/me';
}
