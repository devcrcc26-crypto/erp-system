/**
 * Which create actions the field movement page offers.
 *
 * - "Add" (self): the user takes part in HR processes - has an employee record
 *   and is not an approver-only account.
 * - "Add on behalf": the user may file for at least one employee. The eligible
 *   list (GET /hr/on-behalf/eligible-employees) is the same rule used for leave
 *   and overtime on behalf: HR (hr.view), System Administrator / full-access
 *   roles, and department / discipline leads; approver-only accounts are never
 *   in it. The server enforces the same rule on create.
 */
export function fieldMovementCreateActions(input: {
  employeeId: string | null | undefined;
  excludedFromHrProcesses: boolean | null | undefined;
  eligibleEmployeeCount: number;
}): { canAddSelf: boolean; canAddOnBehalf: boolean } {
  return {
    canAddSelf:
      Boolean(input.employeeId?.trim()) && input.excludedFromHrProcesses !== true,
    canAddOnBehalf: input.eligibleEmployeeCount > 0,
  };
}
