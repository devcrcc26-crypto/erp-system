import { LeaveType } from '@prisma/client';
import {
  getBalanceLeaveType,
  leaveTypeAffectsBalance,
} from './leave-entitlement.util';

describe('leaveTypeAffectsBalance', () => {
  it('unpaid leave never consumes a balance bucket', () => {
    expect(leaveTypeAffectsBalance(LeaveType.UNPAID)).toBe(false);
  });

  it('annual / sick / study still affect balance', () => {
    expect(leaveTypeAffectsBalance(LeaveType.ANNUAL)).toBe(true);
    expect(leaveTypeAffectsBalance(LeaveType.SICK)).toBe(true);
    expect(leaveTypeAffectsBalance(LeaveType.STUDY)).toBe(true);
  });
});

describe('getBalanceLeaveType', () => {
  it('maps study/exam/emergency to annual', () => {
    expect(getBalanceLeaveType(LeaveType.STUDY)).toBe(LeaveType.ANNUAL);
    expect(getBalanceLeaveType(LeaveType.EXAM)).toBe(LeaveType.ANNUAL);
    expect(getBalanceLeaveType(LeaveType.EMERGENCY)).toBe(LeaveType.ANNUAL);
  });

  it('does not treat unpaid as a balance type for callers that gate first', () => {
    expect(leaveTypeAffectsBalance(LeaveType.UNPAID)).toBe(false);
  });
});
