import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveType,
} from '@/lib/api/leave.types';

/** Available days at or below this count as a low balance. */
export const LOW_LEAVE_BALANCE_THRESHOLD = 5;

/** Leave types with their own balance, in display order. */
export type BalanceLeaveType = Extract<
  LeaveType,
  'ANNUAL' | 'MATERNITY' | 'PATERNITY'
>;

export interface EmployeeBalanceEntry {
  leaveType: BalanceLeaveType;
  balance: LeaveBalance;
}

/**
 * A balance is low when what is available is at or below the threshold.
 * Types whose whole allowance is at or below the threshold (e.g. a few days of
 * paternity leave) are never flagged, or every employee would always be "low".
 */
export function isLowLeaveBalance(
  balance: LeaveBalance,
  threshold: number = LOW_LEAVE_BALANCE_THRESHOLD,
): boolean {
  const allowance = balance.entitled + balance.broughtForward;
  return allowance > threshold && balance.remaining <= threshold;
}

/**
 * Maternity for female and paternity for male employees only (neither when
 * gender is not recorded). Mirrors the backend list, so stale cache rows for
 * the other type never reach the table.
 */
export function parentalBalanceFor(
  summary: EmployeeLeaveBalanceSummary,
): EmployeeBalanceEntry | null {
  const gender = summary.employee.gender;
  if (gender === 'FEMALE' && summary.maternity) {
    return { leaveType: 'MATERNITY', balance: summary.maternity };
  }
  if (gender === 'MALE' && summary.paternity) {
    return { leaveType: 'PATERNITY', balance: summary.paternity };
  }
  return null;
}

/** The employee's balances that apply to them: Annual, then parental. */
export function employeeBalanceEntries(
  summary: EmployeeLeaveBalanceSummary,
): EmployeeBalanceEntry[] {
  const entries: EmployeeBalanceEntry[] = [];
  if (summary.annual) {
    entries.push({ leaveType: 'ANNUAL', balance: summary.annual });
  }
  const parental = parentalBalanceFor(summary);
  if (parental) {
    entries.push(parental);
  }
  return entries;
}

/** Banner counts, per employee (not per leave-type row). */
export function summarizeLeaveBalanceStats(
  summaries: readonly EmployeeLeaveBalanceSummary[],
): { employees: number; lowBalance: number; withPending: number } {
  let lowBalance = 0;
  let withPending = 0;
  for (const summary of summaries) {
    const entries = employeeBalanceEntries(summary);
    if (entries.some((entry) => isLowLeaveBalance(entry.balance))) {
      lowBalance += 1;
    }
    if (entries.some((entry) => entry.balance.pending > 0)) {
      withPending += 1;
    }
  }
  return { employees: summaries.length, lowBalance, withPending };
}
