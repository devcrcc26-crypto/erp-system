/**
 * Approver-only accounts (`User.excludedFromHrProcesses`) take part in no HR
 * process of their own: no attendance, payroll, contracts, leave, overtime,
 * field movement, site assignment, WFH, evaluations as evaluatee, headcount /
 * salary / attendance reports or dashboard counts. They still approve.
 *
 * Every query that selects the *subjects* of an HR process must go through
 * `hrProcessEmployeeWhere` - never hand-write the flag - so the rule lives in
 * one place. Approver resolution must NOT use it.
 */

export const EXCLUDED_FROM_HR_MESSAGE =
  'This employee is approver-only and does not take part in HR processes';

/**
 * Narrows a `User` where-clause to HR-process subjects. Use directly on
 * `prisma.user` queries, or on a relation filter (`employee: hrProcessEmployeeWhere({...})`).
 */
export function hrProcessEmployeeWhere<T extends Record<string, unknown>>(
  where: T = {} as T,
): T & { excludedFromHrProcesses: false } {
  return { ...where, excludedFromHrProcesses: false };
}

/** True for approver-only accounts (in-memory check for already-loaded users). */
export function isExcludedFromHrProcesses(
  user: { excludedFromHrProcesses?: boolean | null } | null | undefined,
): boolean {
  return user?.excludedFromHrProcesses === true;
}
