import { LeaveType } from '@prisma/client';
import {
  getBalanceLeaveType,
  POLICY_BALANCE_LEAVE_TYPES,
} from '../../../leave-policy/application/services/leave-policy.service';

/** Leave types whose days are deducted from the annual balance bucket. */
export const DEDUCTS_FROM_ANNUAL: LeaveType[] = [
  LeaveType.STUDY,
  LeaveType.EXAM,
  LeaveType.UNPAID,
  LeaveType.EMERGENCY,
  LeaveType.PATERNITY,
  LeaveType.COMPASSIONATE,
];

/** Leave types with their own balance row (shown on the HR balances tab). */
export const OWN_BALANCE_LEAVE_TYPES: LeaveType[] = [
  ...POLICY_BALANCE_LEAVE_TYPES,
];

/**
 * Resolves which leave-balance row should be checked/adjusted for a request type.
 */
export function resolveBalanceLeaveType(leaveType: LeaveType): LeaveType {
  return getBalanceLeaveType(leaveType);
}
