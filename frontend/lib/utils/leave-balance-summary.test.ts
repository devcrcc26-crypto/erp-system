import { describe, expect, it } from 'vitest';
import type {
  EmployeeLeaveBalanceSummary,
  LeaveBalance,
  LeaveType,
} from '@/lib/api/leave.types';
import {
  employeeBalanceEntries,
  isLowLeaveBalance,
  summarizeLeaveBalanceStats,
} from '@/lib/utils/leave-balance-summary';

function balance(
  leaveType: LeaveType,
  values: Partial<Pick<LeaveBalance, 'entitled' | 'broughtForward' | 'used' | 'pending' | 'remaining'>> = {},
): LeaveBalance {
  return {
    id: leaveType,
    employeeId: 'e',
    year: 2026,
    leaveType,
    entitled: 20,
    broughtForward: 0,
    used: 0,
    pending: 0,
    remaining: 20,
    ...values,
  };
}

function summary(
  id: string,
  gender: 'MALE' | 'FEMALE' | null,
  overrides: Partial<EmployeeLeaveBalanceSummary> = {},
): EmployeeLeaveBalanceSummary {
  return {
    employeeId: id,
    employee: { id, firstName: id, lastName: 'X', email: null, gender },
    year: 2026,
    annual: balance('ANNUAL'),
    sick: balance('SICK'),
    maternity: balance('MATERNITY', { entitled: 120, remaining: 120 }),
    paternity: balance('PATERNITY', { entitled: 3, remaining: 3 }),
    ...overrides,
  };
}

describe('employeeBalanceEntries', () => {
  it('shows maternity only for female and paternity only for male employees', () => {
    const types = (s: EmployeeLeaveBalanceSummary) =>
      employeeBalanceEntries(s).map((entry) => entry.leaveType);
    expect(types(summary('f', 'FEMALE'))).toEqual(['ANNUAL', 'SICK', 'MATERNITY']);
    expect(types(summary('m', 'MALE'))).toEqual(['ANNUAL', 'SICK', 'PATERNITY']);
    expect(types(summary('u', null))).toEqual(['ANNUAL', 'SICK']);
  });
});

describe('isLowLeaveBalance', () => {
  it('flags 5 or fewer available days', () => {
    expect(isLowLeaveBalance(balance('ANNUAL', { remaining: 5 }))).toBe(true);
    expect(isLowLeaveBalance(balance('ANNUAL', { remaining: 6 }))).toBe(false);
  });

  it('never flags a type whose whole allowance is 5 days or less', () => {
    expect(isLowLeaveBalance(balance('PATERNITY', { entitled: 3, remaining: 3 }))).toBe(false);
  });
});

describe('summarizeLeaveBalanceStats', () => {
  it('counts employees, not leave-type rows', () => {
    const lowOnTwoTypes = summary('a', 'MALE', {
      annual: balance('ANNUAL', { remaining: 2 }),
      sick: balance('SICK', { remaining: 1, pending: 2 }),
    });
    const fine = summary('b', 'FEMALE', {
      annual: balance('ANNUAL', { pending: 3 }),
    });
    // A male employee with a stale maternity row must not count as low.
    const staleMaternity = summary('c', 'MALE', {
      maternity: balance('MATERNITY', { entitled: 120, remaining: 0 }),
    });

    expect(summarizeLeaveBalanceStats([lowOnTwoTypes, fine, staleMaternity])).toEqual({
      employees: 3,
      lowBalance: 1,
      withPending: 2,
    });
  });
});
