/**
 * True when the viewer filed the record for another employee (not self-filed).
 * Used for on-behalf banners; assigned chain approvers may still approve.
 */

export function isOnBehalfCreator(
  record: { createdBy: string; employeeId: string } | null | undefined,
  userId: string,
): boolean {
  return (
    record != null &&
    record.createdBy === userId &&
    record.employeeId !== userId
  );
}
