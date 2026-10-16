import { describe, expect, it } from '@jest/globals';
import {
  awaitingEnrolment,
  isCountedPresentMatchMethod,
  NOT_ENROLLED_PAYROLL_NOTE,
  NOT_ENROLLED_RECORD_NOTE,
  previousNotEnrolledMonths,
} from './attendance-enrolment.util';
import {
  summarizeMonthAbsence,
  type DayDeductionContext,
} from './day-deduction.util';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { resolveEntryAttendanceFlag } from '../../../payroll/application/utils/payroll-attendance-flag.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Context the recalculation builds for a record with this match method. */
function contextFor(
  matchMethod: string,
  overrides: Partial<DayDeductionContext> = {},
): DayDeductionContext {
  return {
    isSunday: (date) => date.getUTCDay() === 0,
    isPublicHoliday: () => false,
    isWorkFromHome: () => false,
    siteNameForDate: () => null,
    isOnApprovedLeave: () => false,
    isOnUnpaidLeave: () => false,
    fieldMovementCoverage: () => 'NONE',
    isAttendanceExempt: () => isCountedPresentMatchMethod(matchMethod),
    ...overrides,
  };
}

describe('Needs enrolment - counted present', () => {
  const fullContract = [{ startDate: d(2020, 1, 1), endDate: null }];

  it('is counted present like "Present this month"; scanned methods are not', () => {
    expect(isCountedPresentMatchMethod('NEEDS_ENROLMENT')).toBe(true);
    expect(isCountedPresentMatchMethod('MANUAL_PRESENT')).toBe(true);
    expect(isCountedPresentMatchMethod('EXEMPT')).toBe(true);
    expect(isCountedPresentMatchMethod('COVERED')).toBe(false);
    expect(isCountedPresentMatchMethod('IDENTITY')).toBe(false);
    expect(isCountedPresentMatchMethod('EMPLOYEE_ID')).toBe(false);
    expect(NOT_ENROLLED_RECORD_NOTE).toBe(
      'Not yet enrolled on the attendance machine',
    );
  });

  it('recalc preserves EXEMPT / MANUAL_PRESENT / NEEDS_ENROLMENT / COVERED semantics', () => {
    // Counted-present methods force exempt presence without scans.
    for (const method of ['EXEMPT', 'MANUAL_PRESENT', 'NEEDS_ENROLMENT'] as const) {
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: fullContract,
        dailyLogsByDate: new Map(),
        context: contextFor(method),
      });
      expect(result.paidDays).toBe(30);
      expect(result.fullyAbsentWorkingDays).toBe(false);
    }
    // COVERED relies on site/WFH/paid leave, not the counted-present shortcut.
    const coveredWithoutSchedule = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: fullContract,
      dailyLogsByDate: new Map(),
      context: contextFor('COVERED'),
    });
    expect(coveredWithoutSchedule.fullyAbsentWorkingDays).toBe(true);
    expect(coveredWithoutSchedule.paidDays).toBe(0);

    const coveredWithSite = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: fullContract,
      dailyLogsByDate: new Map(),
      context: contextFor('COVERED', { siteNameForDate: () => 'Camp' }),
    });
    expect(coveredWithSite.paidDays).toBe(30);
    expect(coveredWithSite.fullyAbsentWorkingDays).toBe(false);
  });

  it('full month, no scans → paid 30, absent 0 (Feb, Aug, Sep)', () => {
    for (const month of [2, 8, 9]) {
      const result = summarizeMonthAbsence({
        month,
        year: 2026,
        contracts: fullContract,
        dailyLogsByDate: new Map(),
        context: contextFor('NEEDS_ENROLMENT'),
      });
      expect(result.paidDays).toBe(30);
      expect(result.absentDays).toBe(0);
      expect(result.presentDays).toBe(result.scheduledDays);
    }
  });

  it('joiner Aug 17 → paid 14', () => {
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: d(2026, 8, 17), endDate: null }],
      dailyLogsByDate: new Map(),
      context: contextFor('NEEDS_ENROLMENT'),
    });
    expect(result.paidDays).toBe(14);
    expect(result.absentDays).toBe(0);
  });

  it('one approved leave day → still paid 30, leave shown as leave', () => {
    const leaveKey = '2026-08-06';
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: fullContract,
      dailyLogsByDate: new Map(),
      context: contextFor('NEEDS_ENROLMENT', {
        isOnApprovedLeave: (date) => dateToYyyyMmDd(date) === leaveKey,
      }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.absentDays).toBe(0);
    expect(result.leaveDays).toBe(1);
    expect(result.byDate.get(leaveKey)?.status).toBe('LEAVE');
    expect(result.byDate.get('2026-08-02')?.status).toBe('DAY_OFF');
    expect(result.presentDays).toBe(result.scheduledDays - 1);
  });
});

describe('payroll entry for Needs enrolment', () => {
  it('record present → no MISSING_ATTENDANCE flag, non-blocking note', () => {
    const result = resolveEntryAttendanceFlag({
      hasContract: true,
      attendance: { matchMethod: 'NEEDS_ENROLMENT' },
      missingResolution: 'NEEDS_ENROLMENT',
      monthEndBasic: 15000,
    });
    expect(result.flag).toBe('NONE');
    expect(result.flagNote).toBeUndefined();
    expect(result.entryNote).toBe(NOT_ENROLLED_PAYROLL_NOTE);
    expect(NOT_ENROLLED_PAYROLL_NOTE).toBe(
      'Not enrolled on the attendance machine - counted present.',
    );
  });

  it('scanned record → no note; no record at all → MISSING_ATTENDANCE', () => {
    expect(
      resolveEntryAttendanceFlag({
        hasContract: true,
        attendance: { matchMethod: 'IDENTITY' },
        monthEndBasic: 15000,
      }),
    ).toEqual({ flag: 'NONE', entryNote: undefined });
    expect(
      resolveEntryAttendanceFlag({
        hasContract: true,
        attendance: null,
        missingResolution: 'PENDING',
        monthEndBasic: 15000,
      }).flag,
    ).toBe('MISSING_ATTENDANCE');
  });
});

describe('Not enrolled - nth month', () => {
  it('first month missing → 0 previous (no label)', () => {
    expect(previousNotEnrolledMonths(8, 2026, [])).toBe(0);
  });

  it('next month still missing → 2nd month', () => {
    const previous = previousNotEnrolledMonths(9, 2026, [
      { month: 8, year: 2026 },
    ]);
    expect(previous + 1).toBe(2);
  });

  it('counts only consecutive months, across a year boundary', () => {
    const months = [
      { month: 11, year: 2026 },
      { month: 12, year: 2026 },
      { month: 9, year: 2026 }, // gap in October breaks the streak
    ];
    expect(previousNotEnrolledMonths(1, 2027, months) + 1).toBe(3);
  });
});

describe('Awaiting enrolment list', () => {
  const rec = (
    month: number,
    matchMethod: string,
    hasScan: boolean,
    employeeId = 'e1',
  ) => ({ employeeId, month, year: 2026, matchMethod, hasScan });

  it('lists an employee with Needs enrolment months and no later scan', () => {
    const list = awaitingEnrolment([
      rec(7, 'IDENTITY', true),
      rec(8, 'NEEDS_ENROLMENT', false),
      rec(9, 'NEEDS_ENROLMENT', false),
    ]);
    expect(list).toEqual([
      {
        employeeId: 'e1',
        months: 2,
        since: { month: 8, year: 2026 },
        latest: { month: 9, year: 2026 },
      },
    ]);
  });

  it('a later import with a scan removes the employee', () => {
    expect(
      awaitingEnrolment([
        rec(8, 'NEEDS_ENROLMENT', false),
        rec(9, 'EMPLOYEE_ID', true),
      ]),
    ).toEqual([]);
  });

  it('overwrite that brings scans for the same month removes the employee', () => {
    // Re-import replaced the Needs-enrolment record with a scanned one.
    expect(awaitingEnrolment([rec(8, 'IDENTITY', true)])).toEqual([]);
  });

  it('a matched record without any scan does not count as enrolled', () => {
    const list = awaitingEnrolment([
      rec(8, 'NEEDS_ENROLMENT', false),
      rec(9, 'MANUAL_PRESENT', false),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].months).toBe(1);
  });
});
