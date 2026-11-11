import { describe, expect, it } from '@jest/globals';
import {
  cappedContractSegments,
  effectiveContractEnd,
  employedInMonthWhere,
  resolveEmploymentWindow,
} from './employment-window.util';
import { separationIsEffective, todayInAddisUtc } from './separation-dates.util';
import {
  allocateContractPayrollDays,
  employedPayrollDays,
} from '../../modules/payroll/application/utils/payroll-days.util';
import { computeContractAllowances } from '../../modules/payroll/application/utils/payroll-allowance.util';
import { resolveEmploymentEntryFlag } from '../../modules/payroll/application/utils/payroll-employment-flag.util';
import { employedCalendarDatesForContracts } from '../../modules/attendance/application/utils/day-deduction.util';

const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

const HIRED = d(2025, 1, 1);
const CONTRACT = { transport: 2550, bonus: 56000 };

/** Pay inputs for one employee with a single open-ended contract and an optional leaving date. */
function augustPay(leavingDate: Date | null, mode: 'PRORATED' | 'FULL') {
  const window = resolveEmploymentWindow(
    [{ startDate: HIRED, endDate: leavingDate }],
    HIRED,
    8,
    2026,
  );
  const segments = cappedContractSegments(
    [{ startDate: HIRED, endDate: null, terminatedAt: null }],
    window,
  );
  const employmentEnd = segments[0].endDate;
  const employed = employedPayrollDays(8, 2026, HIRED, employmentEnd).days;
  const allocation = allocateContractPayrollDays(
    8,
    2026,
    [{ id: 'c1', startDate: HIRED, endDate: employmentEnd }],
    HIRED,
    employmentEnd,
  );
  const noLeaverDays = employedPayrollDays(8, 2026, HIRED, null).days;
  const allowances = computeContractAllowances(
    [
      {
        transportationAllowance: CONTRACT.transport,
        monthlyBonus: CONTRACT.bonus,
        allocatedDays: allocation[0].days,
      },
    ],
    employed,
    employed,
    noLeaverDays,
    mode,
    false,
  );
  return { window, employed, allowances };
}

describe('effectiveContractEnd', () => {
  it('is the earlier of endDate and terminatedAt', () => {
    expect(effectiveContractEnd(d(2026, 12, 31), d(2026, 8, 20))).toEqual(d(2026, 8, 20));
    expect(effectiveContractEnd(d(2026, 8, 10), d(2026, 8, 20))).toEqual(d(2026, 8, 10));
    expect(effectiveContractEnd(null, d(2026, 8, 20))).toEqual(d(2026, 8, 20));
    expect(effectiveContractEnd(null, null)).toBeNull();
  });
});

describe('separation Aug 20 → payroll', () => {
  it('pays 20 days, flags the final month, allowances × 20/30 (PRORATED)', () => {
    const { window, employed, allowances } = augustPay(d(2026, 8, 20), 'PRORATED');
    expect(window.leftInMonth).toBe(true);
    expect(employed).toBe(20);
    expect(allowances.transport).toBeCloseTo((2550 * 20) / 30, 2);
    expect(allowances.monthlyBonus).toBeCloseTo((56000 * 20) / 30, 2);

    const flag = resolveEmploymentEntryFlag({
      baseFlag: 'NONE',
      window,
      isActive: false,
    });
    expect(flag.flag).toBe('LEAVER_FINAL_MONTH');
    expect(flag.flagNote).toContain('final settlement handled outside the system');
  });

  it('pays full allowances in FULL leaver mode', () => {
    const { allowances } = augustPay(d(2026, 8, 20), 'FULL');
    expect(allowances.transport).toBe(2550);
    expect(allowances.monthlyBonus).toBe(56000);
  });

  it('left on the last calendar day → 30 days', () => {
    expect(augustPay(d(2026, 8, 31), 'PRORATED').employed).toBe(30);
  });

  it('later months: not on the roster', () => {
    const window = resolveEmploymentWindow(
      [{ startDate: HIRED, endDate: d(2026, 8, 20) }],
      HIRED,
      9,
      2026,
    );
    expect(window.overlapsMonth).toBe(false);
  });

  it('keeps a data-problem flag and appends the leaver note', () => {
    const { window } = augustPay(d(2026, 8, 20), 'PRORATED');
    const flag = resolveEmploymentEntryFlag({
      baseFlag: 'MISSING_ATTENDANCE',
      baseNote: 'No attendance record found for this month',
      window,
      isActive: true,
    });
    expect(flag.flag).toBe('MISSING_ATTENDANCE');
    expect(flag.flagNote).toContain('Leaver final month');
  });
});

describe('future-dated separation', () => {
  it('is paid normally in earlier months and is not effective yet', () => {
    const { window, employed, allowances } = augustPay(d(2026, 12, 31), 'PRORATED');
    expect(window.leftInMonth).toBe(false);
    expect(employed).toBe(30);
    expect(allowances.transport).toBe(2550);
    expect(resolveEmploymentEntryFlag({ baseFlag: 'NONE', window, isActive: true }).flag).toBe(
      'NONE',
    );
    // Login stays on until the daily job runs after the leaving date.
    const today = todayInAddisUtc(new Date('2026-10-15T09:00:00Z'));
    expect(separationIsEffective(d(2026, 12, 31), today)).toBe(false);
    expect(separationIsEffective(d(2026, 10, 14), today)).toBe(true);
    expect(separationIsEffective(d(2026, 10, 15), today)).toBe(false);
  });

  it('uses the Addis Ababa date (UTC+3) for "today"', () => {
    expect(todayInAddisUtc(new Date('2026-10-14T21:30:00Z'))).toEqual(d(2026, 10, 15));
    expect(todayInAddisUtc(new Date('2026-10-14T20:30:00Z'))).toEqual(d(2026, 10, 14));
  });
});

describe('terminated contract with null endDate', () => {
  it('no longer drops out of payroll: the contract ends at terminatedAt', () => {
    const segments = cappedContractSegments(
      [{ startDate: HIRED, endDate: null, terminatedAt: d(2026, 8, 20) }],
      null,
    );
    expect(segments).toEqual([{ startDate: HIRED, endDate: d(2026, 8, 20) }]);
    expect(employedPayrollDays(8, 2026, HIRED, segments[0].endDate).days).toBe(20);
  });

  it('drops a contract that ends before it starts', () => {
    expect(
      cappedContractSegments(
        [{ startDate: d(2026, 9, 1), endDate: null, terminatedAt: null }],
        resolveEmploymentWindow([{ startDate: HIRED, endDate: d(2026, 8, 20) }], HIRED, 8, 2026),
      ),
    ).toEqual([]);
  });
});

describe('login disabled but still employed', () => {
  it('stays on the roster (open period) and is flagged', () => {
    const window = resolveEmploymentWindow([{ startDate: HIRED, endDate: null }], HIRED, 8, 2026);
    expect(window.overlapsMonth).toBe(true);
    const flag = resolveEmploymentEntryFlag({ baseFlag: 'NONE', window, isActive: false });
    expect(flag.flag).toBe('LOGIN_DISABLED_STILL_EMPLOYED');
  });

  it('roster filter selects by employment period, not isActive (legacy users: isActive)', () => {
    const where = employedInMonthWhere(8, 2026);
    expect(where.OR).toHaveLength(2);
    expect(JSON.stringify(where.OR?.[0])).toContain('employmentPeriods');
    expect(where.OR?.[1]).toMatchObject({ isActive: true, employmentPeriods: { none: {} } });
  });

  it('falls back to employmentDate, open-ended, when there are no periods yet', () => {
    const window = resolveEmploymentWindow([], HIRED, 8, 2026);
    expect(window).toMatchObject({ start: HIRED, end: null, overlapsMonth: true, fromPeriods: false });
  });
});

describe('attendance after leaving', () => {
  it('days after the leaving date are outside the employed window (never absences)', () => {
    const window = resolveEmploymentWindow(
      [{ startDate: HIRED, endDate: d(2026, 8, 20) }],
      HIRED,
      8,
      2026,
    );
    const segments = cappedContractSegments(
      [{ startDate: HIRED, endDate: null, terminatedAt: null }],
      window,
    );
    const employedDates = employedCalendarDatesForContracts(8, 2026, segments);
    expect(employedDates).toHaveLength(20);
    expect(employedDates.some((date) => date.getTime() > d(2026, 8, 20).getTime())).toBe(false);
  });
});
