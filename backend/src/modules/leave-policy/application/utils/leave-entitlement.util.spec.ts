import { LeaveType } from '@prisma/client';
import {
  entitlementFromPolicyRule,
  getBalanceLeaveType,
  inferMinServiceYears,
  leaveTypeAffectsBalance,
  type PolicyRuleRow,
} from './leave-entitlement.util';

/** Standard Staff annual rule: 16 days, +1 every 2 years, max 20. */
const STANDARD_ANNUAL: PolicyRuleRow = {
  leaveType: LeaveType.ANNUAL,
  baseDays: 16,
  isProgressive: true,
  incrementDays: 1,
  incrementEveryYears: 2,
  minimumServiceMonths: 0,
  maxDaysCap: 20,
  maxCarryForwardDays: null,
  requiresReceipt: false,
};

describe('entitlementFromPolicyRule (Standard Staff annual)', () => {
  it.each([
    [0, 16],
    [1, 16],
    [2, 17],
    [3, 17],
    [4, 18],
    [6, 19],
    [8, 20],
    [10, 20],
    [30, 20],
  ])('%i service years -> %i days', (years, days) => {
    expect(entitlementFromPolicyRule(STANDARD_ANNUAL, years)).toBe(days);
  });

  it('grows without bound when maxDaysCap is null', () => {
    expect(
      entitlementFromPolicyRule({ ...STANDARD_ANNUAL, maxDaysCap: null }, 10),
    ).toBe(21);
  });
});

describe('inferMinServiceYears', () => {
  it.each([
    [16, 0],
    [17, 2],
    [18, 4],
    [19, 6],
    [20, 8],
  ])('%i days -> at least %i service years', (days, years) => {
    expect(inferMinServiceYears(STANDARD_ANNUAL, days)).toBe(years);
  });

  it('round-trips: the inferred years grant the same entitlement', () => {
    for (const days of [16, 17, 18, 19, 20]) {
      const years = inferMinServiceYears(STANDARD_ANNUAL, days);
      expect(years).not.toBeNull();
      expect(entitlementFromPolicyRule(STANDARD_ANNUAL, years ?? 0)).toBe(days);
    }
  });

  it('returns null for an entitlement the rule never grants', () => {
    expect(inferMinServiceYears(STANDARD_ANNUAL, 15)).toBeNull();
    expect(inferMinServiceYears(STANDARD_ANNUAL, 21)).toBeNull();
    expect(inferMinServiceYears(STANDARD_ANNUAL, 16.5)).toBeNull();
  });
});

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
