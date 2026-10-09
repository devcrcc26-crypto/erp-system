/**
 * Four-eyes rule for records filed on someone's behalf: the person who filed
 * the record for another employee may not approve it, even when they also hold
 * a tier in that employee's chain. Applies to field movement logs.
 */

export const ON_BEHALF_CREATOR_APPROVAL_MESSAGE =
  'You submitted this on behalf of the employee, so another approver must decide it';

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
