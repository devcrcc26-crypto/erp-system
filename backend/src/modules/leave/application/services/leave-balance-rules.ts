import { LeaveType } from '@prisma/client';

/** Leave types whose days are deducted from the annual balance bucket. */
export const DEDUCTS_FROM_ANNUAL: LeaveType[] = [
  LeaveType.SICK,
  LeaveType.STUDY,
  LeaveType.EXAM,
  LeaveType.UNPAID,
];

/**
 * Resolves which leave-balance row should be checked/adjusted for a request type.
 * ANNUAL deducts from itself; maternity/compassionate use their own balances.
 */
export function resolveBalanceLeaveType(leaveType: LeaveType): LeaveType {
  if (DEDUCTS_FROM_ANNUAL.includes(leaveType)) {
    return LeaveType.ANNUAL;
  }

  return leaveType;
}
