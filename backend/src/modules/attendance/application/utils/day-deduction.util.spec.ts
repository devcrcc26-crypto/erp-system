import { describe, expect, it } from '@jest/globals';
import {
  dayDeduction,
  FULLY_ABSENT_NO_PAY_NOTE,
  isFullyAbsentFromStoredLogs,
  summarizeMonthAbsence,
  type DayDeductionContext,
  type DayDeductionDayInput,
} from './day-deduction.util';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { calculateLeaveDaysForRange } from '../../../leave/application/utils/leave-days.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function emptyContext(overrides: Partial<DayDeductionContext> = {}): DayDeductionContext {
  return {
    isSunday: (date) => date.getUTCDay() === 0,
    isPublicHoliday: () => false,
    isWorkFromHome: () => false,
    siteNameForDate: () => null,
    isOnApprovedLeave: () => false,
    isOnUnpaidLeave: () => false,
    fieldMovementCoverage: () => 'NONE',
    earlyDepartureWaiver: () => 'NONE',
    isAttendanceExempt: () => false,
    ...overrides,
  };
}

function dayInput(
  date: Date,
  partial: Partial<DayDeductionDayInput> = {},
): DayDeductionDayInput {
  return {
    date,
    clockIn: '08:00',
    clockOut: '17:30',
    isLastExportDay: false,
    scheduledEnd: '17:30',
    ...partial,
  };
}

function logsForMonth(
  month: number,
  year: number,
  contractStart: Date,
  contractEnd: Date | null,
  builder: (date: Date, key: string) => DayDeductionDayInput | undefined,
): Map<string, DayDeductionDayInput> {
  const map = new Map<string, DayDeductionDayInput>();
  const summary = summarizeMonthAbsence({
    month,
    year,
    contracts: [{ startDate: contractStart, endDate: contractEnd }],
    dailyLogsByDate: new Map(),
    context: emptyContext(),
  });
  for (const key of summary.byDate.keys()) {
    const date = d(year, month, Number(key.slice(8, 10)));
    const built = builder(date, key);
    if (built) {
      map.set(key, built);
    }
  }
  return map;
}

describe('dayDeduction / summarizeMonthAbsence', () => {
  const fullContractStart = d(2020, 1, 1);

  it('no-scan working day in enrolment grace → ENROLMENT_GRACE, deduction 0', () => {
    const date = d(2026, 8, 17);
    const r = dayDeduction(
      date,
      dayInput(date, { clockIn: null, clockOut: null }),
      emptyContext({ isEnrolmentGrace: () => true }),
    );
    expect(r.status).toBe('ENROLMENT_GRACE');
    expect(r.deduction).toBe(0);
  });

  it('full month, no absences: Feb → 30, Aug → 30, Sep → 30', () => {
    for (const month of [2, 8, 9]) {
      const daily = logsForMonth(month, 2026, fullContractStart, null, (date) =>
        dayInput(date),
      );
      const result = summarizeMonthAbsence({
        month,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(result.paidDays).toBe(30);
      expect(result.absentDays).toBe(0);
      expect(result.fullyAbsentWorkingDays).toBe(false);
    }
  });

  it('3 absences (including a Saturday) → 27 in Feb, Aug, and Sep', () => {
    // Pick Mon + Wed + Sat in each month (dates that fall on those DOWs).
    const absencesByMonth: Record<number, [Date, Date, Date]> = {
      2: [d(2026, 2, 2), d(2026, 2, 4), d(2026, 2, 7)], // Mon Wed Sat
      8: [d(2026, 8, 3), d(2026, 8, 5), d(2026, 8, 8)], // Mon Wed Sat
      9: [d(2026, 9, 7), d(2026, 9, 9), d(2026, 9, 12)], // Mon Wed Sat
    };
    for (const month of [2, 8, 9]) {
      const keys = new Set(
        absencesByMonth[month]!.map((date) => dateToYyyyMmDd(date)),
      );
      const daily = logsForMonth(month, 2026, fullContractStart, null, (date, key) => {
        if (keys.has(key)) {
          return dayInput(date, { clockIn: null, clockOut: null });
        }
        return dayInput(date);
      });
      const result = summarizeMonthAbsence({
        month,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      // Mon 1 + Wed 1 + Sat 1 = 3 against the 30-day base (Sundays still paid)
      expect(result.absentDays).toBe(3);
      expect(result.paidDays).toBe(27);
      const satKey = dateToYyyyMmDd(absencesByMonth[month]![2]!);
      expect(result.byDate.get(satKey)?.deduction).toBe(1);
    }
  });

  it('no scan on a Monday and a Saturday → paid 28', () => {
    const month = 8;
    const year = 2026;
    const mon = d(2026, 8, 3);
    const sat = d(2026, 8, 8);
    const daily = logsForMonth(month, year, fullContractStart, null, (date, key) => {
      if (key === dateToYyyyMmDd(mon) || key === dateToYyyyMmDd(sat)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month,
      year,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    // Mon 1 + Sat 1 = 2 against the 30-day base (Sundays still paid)
    expect(result.paidDays).toBe(28);
    expect(result.absentDays).toBe(2);
  });

  it('no scan on a Sunday → paid 30', () => {
    const month = 8;
    const year = 2026;
    const sun = d(2026, 8, 2);
    const daily = logsForMonth(month, year, fullContractStart, null, (date, key) => {
      if (key === dateToYyyyMmDd(sun)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month,
      year,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.paidDays).toBe(30);
  });

  it('no scan on a public holiday → paid 30', () => {
    const holiday = d(2026, 8, 25);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
      if (key === dateToYyyyMmDd(holiday)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isPublicHoliday: (date) =>
          dateToYyyyMmDd(date) === dateToYyyyMmDd(holiday),
      }),
    });
    expect(result.paidDays).toBe(30);
  });

  it('no scan on a WFH day → paid 30', () => {
    const wfh = d(2026, 8, 12);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
      if (key === dateToYyyyMmDd(wfh)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isWorkFromHome: (date) => dateToYyyyMmDd(date) === dateToYyyyMmDd(wfh),
      }),
    });
    expect(result.paidDays).toBe(30);
  });

  it('approved leave day, no scan → paid 30', () => {
    const leaveDay = d(2026, 8, 6);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
      if (key === dateToYyyyMmDd(leaveDay)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnApprovedLeave: (date) =>
          dateToYyyyMmDd(date) === dateToYyyyMmDd(leaveDay),
      }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.leaveDays).toBe(1);
  });

  it('missing clock-out, approved field movement → paid 30', () => {
    const day = d(2026, 8, 4);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        fieldMovementCoverage: (date) =>
          dateToYyyyMmDd(date) === key ? 'APPROVED' : 'NONE',
      }),
    });
    expect(result.paidDays).toBe(30);
  });

  it('missing clock-out, no field movement → paid 29.5', () => {
    const day = d(2026, 8, 4);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.paidDays).toBe(29.5);
    expect(result.absentDays).toBe(0.5);
  });

  it('early departure, FM pending, REPORT_ONLY → paid unchanged, wouldDeduct 0.5', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        earlyDepartureMode: 'REPORT_ONLY',
        earlyDepartureWaiver: (date) =>
          dateToYyyyMmDd(date) === key ? 'PENDING' : 'NONE',
      }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.byDate.get(key)?.earlyDepartureWouldDeduct).toBe(0.5);
    expect(result.byDate.get(key)?.status).toBe('FIELD_MOVEMENT_PENDING');
  });

  it('early departure, FM pending, ENFORCED → paid 29.5', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        earlyDepartureMode: 'ENFORCED',
        earlyDepartureWaiver: (date) =>
          dateToYyyyMmDd(date) === key ? 'PENDING' : 'NONE',
      }),
    });
    expect(result.paidDays).toBe(29.5);
    expect(result.byDate.get(key)?.status).toBe('FIELD_MOVEMENT_PENDING');
  });

  it('late arrival only → paid 30 (no late deduction)', () => {
    const day = d(2026, 8, 7);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockIn: '10:30' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.paidDays).toBe(30);
  });

  it('REPORT_ONLY: clockOut 15:00 without FM → paid unchanged, wouldDeduct 0.5', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ earlyDepartureMode: 'REPORT_ONLY' }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.byDate.get(key)?.earlyDepartureWouldDeduct).toBe(0.5);
    expect(result.byDate.get(key)?.deduction).toBe(0);
    expect(result.fullyAbsentWorkingDays).toBe(false);
  });

  it('ENFORCED: clockOut 15:00 without FM → paid 29.5', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ earlyDepartureMode: 'ENFORCED' }),
    });
    expect(result.paidDays).toBe(29.5);
    expect(result.byDate.get(key)?.status).toBe('HALF_ABSENT');
  });

  it('single scan + approved EARLY_LEAVE → 0 (no stack)', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        fieldMovementCoverage: (date) =>
          dateToYyyyMmDd(date) === key ? 'APPROVED' : 'NONE',
      }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(0);
    expect(result.paidDays).toBe(30);
  });

  it('FORGOT_CLOCK_OUT approved fills missing out (coverage) → 0 while still missing', () => {
    const day = d(2026, 8, 6);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        fieldMovementCoverage: (date) =>
          dateToYyyyMmDd(date) === key ? 'APPROVED' : 'NONE',
      }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(0);
  });

  it('FORGOT_CLOCK_OUT stated 15:00 (no early waiver) REPORT_ONLY → wouldDeduct 0.5, paid unchanged', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        earlyDepartureMode: 'REPORT_ONLY',
        fieldMovementCoverage: () => 'APPROVED',
        earlyDepartureWaiver: () => 'NONE',
      }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.byDate.get(key)?.earlyDepartureWouldDeduct).toBe(0.5);
    expect(result.byDate.get(key)?.deduction).toBe(0);
  });

  it('FORGOT_CLOCK_OUT stated 15:00 ENFORCED → 0.5 (forgot does not waive early departure)', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        earlyDepartureMode: 'ENFORCED',
        fieldMovementCoverage: () => 'APPROVED',
        earlyDepartureWaiver: () => 'NONE',
      }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(0.5);
    expect(result.paidDays).toBe(29.5);
  });

  it('FORGOT_CLOCK_OUT stated 17:30 → nothing', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '17:30' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        earlyDepartureMode: 'ENFORCED',
        earlyDepartureWaiver: () => 'NONE',
      }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(0);
    expect(result.byDate.get(key)?.earlyDepartureWouldDeduct).toBe(0);
    expect(result.paidDays).toBe(30);
  });

  it('FORGOT_CLOCK_OUT 15:00 + EARLY_LEAVE approved → 0', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        earlyDepartureMode: 'ENFORCED',
        fieldMovementCoverage: () => 'APPROVED',
        earlyDepartureWaiver: (date) =>
          dateToYyyyMmDd(date) === key ? 'APPROVED' : 'NONE',
      }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(0);
    expect(result.paidDays).toBe(30);
  });

  it('last OUT 15:00, no FM, REPORT_ONLY → paid unchanged, would-deduct 0.5', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockOut: '15:00' });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ earlyDepartureMode: 'REPORT_ONLY' }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.absentDays).toBe(0);
    expect(result.byDate.get(key)?.earlyDepartureWouldDeduct).toBe(0.5);
    expect(result.byDate.get(key)?.deduction).toBe(0);
  });

  it('on site all month, no scans → paid 30', () => {
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ siteNameForDate: () => 'Dire Dawa' }),
    });
    expect(result.paidDays).toBe(30);
    expect(result.fullyAbsentWorkingDays).toBe(false);
    expect(result.absentDays).toBe(0);
  });

  it('COVERED-style full-month site: no scans → paid 30, not fully absent (payroll keeps transport/bonus)', () => {
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ siteNameForDate: () => 'Camp' }),
    });
    expect(result.fullyAbsentWorkingDays).toBe(false);
    expect(result.paidDays).toBe(30);
    expect(
      isFullyAbsentFromStoredLogs(
        result.paidDays,
        [...result.byDate.entries()].map(([key, day]) => ({
          date: d(2026, 8, Number(key.slice(8, 10))),
          dayDeduction: day.deduction,
          isHoliday: day.status === 'HOLIDAY',
        })),
        [{ windowStart: d(2026, 8, 1), windowEnd: d(2026, 8, 31) }],
      ),
    ).toBe(false);
  });

  it('no scans + no coverage → paid 0 and fully absent', () => {
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.fullyAbsentWorkingDays).toBe(true);
    expect(result.paidDays).toBe(0);
  });

  it('unpaid leave day with no scan → UNPAID_LEAVE, deduction 1 (Saturday included)', () => {
    const unpaidSat = d(2026, 8, 8); // Saturday
    const key = dateToYyyyMmDd(unpaidSat);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: (date) => dateToYyyyMmDd(date) === key,
      }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(1);
    expect(result.byDate.get(key)?.status).toBe('UNPAID_LEAVE');
    expect(result.unpaidLeaveDays).toBe(1);
    expect(result.absentDays).toBe(0);
    expect(result.paidDays).toBe(29);
  });

  it('unpaid leave Fri–Mon: the Sunday rest day inside it stays paid (default) → 3 unpaid days', () => {
    // Fri 7 Aug … Mon 10 Aug 2026
    const keys = new Set([
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ]);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (keys.has(k)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: (date) => keys.has(dateToYyyyMmDd(date)),
      }),
    });
    expect(result.unpaidLeaveDays).toBe(3);
    expect(result.byDate.get('2026-08-09')?.status).toBe('DAY_OFF'); // Sunday
    expect(result.paidDays).toBe(27);

    // unpaidLeaveCountsRestDays = true: the Sunday counts as unpaid too.
    const counted = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: (date) => keys.has(dateToYyyyMmDd(date)),
        unpaidLeaveCountsRestDays: true,
      }),
    });
    expect(counted.unpaidLeaveDays).toBe(4);
    expect(counted.byDate.get('2026-08-09')?.status).toBe('UNPAID_LEAVE');
    expect(counted.paidDays).toBe(26);
  });

  it('full-month unpaid leave → paid 0', () => {
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: () => true,
      }),
    });
    // Rest days stay DAY_OFF, but every duty day is unpaid → fully-absent rule → 0.
    expect(result.paidDays).toBe(0);
    expect(result.fullyAbsentWorkingDays).toBe(true);
    expect(
      [...result.byDate.values()].every(
        (r) => r.status === 'UNPAID_LEAVE' || r.status === 'DAY_OFF',
      ),
    ).toBe(true);
    expect(result.byDate.get('2026-08-02')?.status).toBe('DAY_OFF'); // Sunday
  });

  describe('Sunday paid-rest exclusion (zero duty days worked)', () => {
    it('absent Mon–Sat every week all month → paidDays 0 (Sundays excluded)', () => {
      const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      // Without exclusion, residual would be Sunday rest days (~5); must be 0.
      expect(result.absentDays).toBe(26);
      expect(result.byDate.get('2026-08-02')?.deduction).toBe(0); // Sunday
      expect(result.byDate.get('2026-08-02')?.status).toBe('DAY_OFF');
      expect(result.paidDays).toBe(0);
      expect(result.fullyAbsentWorkingDays).toBe(true);
    });

    it('full-month UNPAID leave → paidDays 0 (Sundays excluded)', () => {
      const daily = logsForMonth(9, 2026, fullContractStart, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const result = summarizeMonthAbsence({
        month: 9,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext({ isOnUnpaidLeave: () => true }),
      });
      expect(result.paidDays).toBe(0);
      expect(result.fullyAbsentWorkingDays).toBe(true);
      expect(result.byDate.get('2026-09-06')?.status).toBe('DAY_OFF'); // Sunday
    });

    it('absent all weekdays but present one Saturday → paidDays > 0, Sundays included', () => {
      const presentSat = '2026-08-08';
      const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
        if (key === presentSat) {
          return dayInput(date);
        }
        return dayInput(date, { clockIn: null, clockOut: null });
      });
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      // 25 Mon–Sat absences; one Saturday present → Sundays remain paid rest.
      expect(result.absentDays).toBe(25);
      expect(result.byDate.get(presentSat)?.status).toBe('PRESENT');
      expect(result.fullyAbsentWorkingDays).toBe(false);
      expect(result.paidDays).toBe(5); // 30 − 25
      expect(result.paidDays).toBeGreaterThan(0);
    });

    it('normal employee with some absences → Sundays still counted (no regression)', () => {
      const absentKeys = new Set(['2026-08-03', '2026-08-04']); // Mon Tue
      const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
        if (absentKeys.has(key)) {
          return dayInput(date, { clockIn: null, clockOut: null });
        }
        return dayInput(date);
      });
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(result.absentDays).toBe(2);
      expect(result.fullyAbsentWorkingDays).toBe(false);
      // 30 − 2 = 28 includes Sunday paid rest (not stripped).
      expect(result.paidDays).toBe(28);
      expect(result.byDate.get('2026-08-02')?.deduction).toBe(0);
    });
  });

  it('unpaid leave Mon–Fri → absent 0, unpaid 5, paid 25 (never double-counted)', () => {
    // Mon 3 Aug … Fri 7 Aug 2026
    const unpaidKeys = new Set([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (unpaidKeys.has(k)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: (date) => unpaidKeys.has(dateToYyyyMmDd(date)),
      }),
    });
    for (const key of unpaidKeys) {
      expect(result.byDate.get(key)?.status).toBe('UNPAID_LEAVE');
      expect(result.byDate.get(key)?.deduction).toBe(1);
    }
    expect(result.absentDays).toBe(0);
    expect(result.unpaidLeaveDays).toBe(5);
    expect(result.paidDays).toBe(25);
    // Deduction counted once: paid = employed − absent − unpaid
    expect(result.paidDays).toBe(
      result.employedDays - result.absentDays - result.unpaidLeaveDays,
    );
  });

  it('unpaid leave Mon–Fri + 2 other absences → absent 2, unpaid 5, paid 23', () => {
    const unpaidKeys = new Set([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
    // Two other absences outside the unpaid range (Mon 10, Tue 11 Aug)
    const absentKeys = new Set(['2026-08-10', '2026-08-11']);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (unpaidKeys.has(k) || absentKeys.has(k)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: (date) => unpaidKeys.has(dateToYyyyMmDd(date)),
      }),
    });
    expect(result.byDate.get('2026-08-10')?.status).toBe('ABSENT');
    expect(result.byDate.get('2026-08-03')?.status).toBe('UNPAID_LEAVE');
    expect(result.absentDays).toBe(2);
    expect(result.unpaidLeaveDays).toBe(5);
    expect(result.paidDays).toBe(23);
    expect(result.absentDays + result.unpaidLeaveDays).toBe(7);
  });

  it('joiner Aug 24 with unpaid leave Aug 20–26 → only Aug 24–26 count (3), paid 4', () => {
    const join = d(2026, 8, 24);
    const unpaidKeys = new Set([
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
    const daily = logsForMonth(8, 2026, join, null, (date, k) => {
      if (unpaidKeys.has(k)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnUnpaidLeave: (date) => unpaidKeys.has(dateToYyyyMmDd(date)),
      }),
    });
    // Pre-hire dates are outside the employment window
    expect(result.byDate.has('2026-08-20')).toBe(false);
    expect(result.byDate.has('2026-08-23')).toBe(false);
    expect(result.byDate.get('2026-08-24')?.status).toBe('UNPAID_LEAVE');
    expect(result.byDate.get('2026-08-25')?.status).toBe('UNPAID_LEAVE');
    expect(result.byDate.get('2026-08-26')?.status).toBe('UNPAID_LEAVE');
    expect(result.employedDays).toBe(7);
    expect(result.absentDays).toBe(0);
    expect(result.unpaidLeaveDays).toBe(3);
    expect(result.paidDays).toBe(4);
  });

  it('unpaid leave overrides site coverage that day', () => {
    const day = d(2026, 8, 5);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        siteNameForDate: () => 'Camp',
        isOnUnpaidLeave: (date) => dateToYyyyMmDd(date) === key,
      }),
    });
    expect(result.byDate.get(key)?.status).toBe('UNPAID_LEAVE');
    expect(result.byDate.get(key)?.deduction).toBe(1);
  });

  it('approved site Mon–Wed only, no scans those days → 0 deduction on site days', () => {
    const mon = d(2026, 8, 3);
    const wed = d(2026, 8, 5);
    const thu = d(2026, 8, 6);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const siteOnly = (date: Date): string | null => {
      const t = date.getTime();
      if (t >= mon.getTime() && t <= wed.getTime()) {
        return 'Camp';
      }
      return null;
    };
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ siteNameForDate: siteOnly }),
    });
    expect(result.byDate.get(dateToYyyyMmDd(mon))?.status).toBe('ON_SITE');
    expect(result.byDate.get(dateToYyyyMmDd(wed))?.status).toBe('ON_SITE');
    expect(result.byDate.get(dateToYyyyMmDd(thu))?.status).toBe('ABSENT');
    expect(result.paidDays).toBeGreaterThan(0);
    expect(result.paidDays).toBeLessThan(30);
  });

  it('pending site (not in context) + no scan → full absence that day', () => {
    const day = d(2026, 8, 4);
    const key = dateToYyyyMmDd(day);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ siteNameForDate: () => null }),
    });
    expect(result.byDate.get(key)?.deduction).toBe(1);
    expect(result.byDate.get(key)?.status).toBe('ABSENT');
  });

  it('WFH approved + missing punch → paid, status WORK_FROM_HOME', () => {
    const wfh = d(2026, 8, 12);
    const key = dateToYyyyMmDd(wfh);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, k) => {
      if (k === key) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isWorkFromHome: (date) => dateToYyyyMmDd(date) === key,
      }),
    });
    expect(result.byDate.get(key)?.status).toBe('WORK_FROM_HOME');
    expect(result.byDate.get(key)?.deduction).toBe(0);
    expect(result.paidDays).toBe(30);
  });

  it('fully absent: Aug → 0, Feb → 0, Sep → 0 (never negative, never 5 or 6)', () => {
    for (const month of [2, 8, 9]) {
      const daily = logsForMonth(month, 2026, fullContractStart, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const result = summarizeMonthAbsence({
        month,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(result.fullyAbsentWorkingDays).toBe(true);
      expect(result.paidDays).toBe(0);
      expect(result.paidDays).toBeGreaterThanOrEqual(0);
      expect(result.paidDays).not.toBe(5);
      expect(result.paidDays).not.toBe(6);
      expect(result.absentDays).toBeGreaterThan(0);
    }
  });

  it('absent every working day except one approved leave day → not fully absent', () => {
    const leaveDay = d(2026, 8, 6); // Thursday
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnApprovedLeave: (date) =>
          dateToYyyyMmDd(date) === dateToYyyyMmDd(leaveDay),
      }),
    });
    expect(result.fullyAbsentWorkingDays).toBe(false);
    expect(result.leaveDays).toBe(1);
    expect(result.paidDays).toBe(
      Math.max(0, result.employedDays - result.absentDays),
    );
    expect(result.paidDays).toBeGreaterThan(0);
  });

  it('joiner Aug 17, absent every working day from the 17th → 0', () => {
    const join = d(2026, 8, 17);
    const daily = logsForMonth(8, 2026, join, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.employedDays).toBe(14);
    expect(result.fullyAbsentWorkingDays).toBe(true);
    expect(result.paidDays).toBe(0);
  });

  it('no contract, employment date Aug 17, present → paid 14 (not 30)', () => {
    const join = d(2026, 8, 17);
    const daily = logsForMonth(8, 2026, join, null, (date) => dayInput(date));
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      // Same shape attendance uses after resolveEmploymentSegmentsForMonth
      // when there is no overlapping contract.
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.employedDays).toBe(14);
    expect(result.paidDays).toBe(14);
    expect(result.paidDays).not.toBe(30);
  });

  it('no contract and no employment window → paid 0 (not whole month)', () => {
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [],
      dailyLogsByDate: new Map(),
      context: emptyContext(),
    });
    expect(result.employedDays).toBe(0);
    expect(result.paidDays).toBe(0);
  });

  it('joined June 8, no scan on June 10 → paid 22', () => {
    const join = d(2026, 6, 8);
    const miss = d(2026, 6, 10);
    const daily = logsForMonth(6, 2026, join, null, (date, key) => {
      if (key === dateToYyyyMmDd(miss)) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 6,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.employedDays).toBe(23);
    expect(result.paidDays).toBe(22);
  });

  it('WFH scoped to one department - others still deducted without scan', () => {
    const wfh = d(2026, 8, 12);
    const wfhKey = dateToYyyyMmDd(wfh);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
      if (key === wfhKey) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date);
    });
    const inDept = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isWorkFromHome: (date) => dateToYyyyMmDd(date) === wfhKey,
      }),
    });
    const outDept = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({ isWorkFromHome: () => false }),
    });
    expect(inDept.paidDays).toBe(30);
    expect(outDept.paidDays).toBe(29);
  });

  it('example month → absent 2.5, paid 27.5 (Sat full miss = 1)', () => {
    const mon = d(2026, 8, 3);
    const half = d(2026, 8, 4);
    const sat = d(2026, 8, 8);
    const monKey = dateToYyyyMmDd(mon);
    const halfKey = dateToYyyyMmDd(half);
    const satKey = dateToYyyyMmDd(sat);
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
      if (key === monKey || key === satKey) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      if (key === halfKey) {
        return dayInput(date, { clockOut: null });
      }
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    // Mon ABSENT 1 + Tue HALF_ABSENT 0.5 + Sat ABSENT 1 = 2.5
    expect(result.absentDays).toBe(2.5);
    expect(result.paidDays).toBe(27.5);
  });

  it('dayDeduction unit: half absent when no FM', () => {
    const date = d(2026, 8, 1);
    const r = dayDeduction(
      date,
      dayInput(date, { clockOut: null }),
      emptyContext(),
    );
    expect(r.deduction).toBe(0.5);
    expect(r.status).toBe('HALF_ABSENT');
  });

  it('approved site + clock-in only → ON_SITE, deduction 0 (no missing-punch)', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockOut: null }),
      emptyContext({ siteNameForDate: () => 'Camp A' }),
    );
    expect(r).toMatchObject({
      status: 'ON_SITE',
      deduction: 0,
      siteName: 'Camp A',
    });
  });

  it('approved site + early out → ON_SITE, deduction 0', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockOut: '15:00' }),
      emptyContext({
        siteNameForDate: () => 'Camp A',
        earlyDepartureMode: 'ENFORCED',
      }),
    );
    expect(r).toMatchObject({ status: 'ON_SITE', deduction: 0 });
  });

  it('approved WFH + 1 punch → WORK_FROM_HOME, deduction 0', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockOut: null }),
      emptyContext({ isWorkFromHome: () => true }),
    );
    expect(r).toMatchObject({ status: 'WORK_FROM_HOME', deduction: 0 });
  });

  it('pending site (not in context) + 1 punch → HALF_ABSENT 0.5', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockOut: null }),
      emptyContext({ siteNameForDate: () => null }),
    );
    expect(r).toMatchObject({ status: 'HALF_ABSENT', deduction: 0.5 });
  });

  it('approved leave + any scan → LEAVE 0 with onLeaveButScanned', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockOut: null }),
      emptyContext({ isOnApprovedLeave: () => true }),
    );
    expect(r).toMatchObject({
      status: 'LEAVE',
      deduction: 0,
      onLeaveButScanned: true,
    });
  });

  it('approved leave + no scan → LEAVE 0 without onLeaveButScanned', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockIn: null, clockOut: null }),
      emptyContext({ isOnApprovedLeave: () => true }),
    );
    expect(r).toMatchObject({
      status: 'LEAVE',
      deduction: 0,
      onLeaveButScanned: false,
    });
  });

  it('approved leave wins over approved site on the same day', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockIn: null, clockOut: null }),
      emptyContext({
        isOnApprovedLeave: () => true,
        siteNameForDate: () => 'Camp',
      }),
    );
    expect(r.status).toBe('LEAVE');
  });

  it('EXEMPT employee with no scan → full presence (no deduction)', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockIn: null, clockOut: null }),
      emptyContext({ isAttendanceExempt: () => true }),
    );
    expect(r.deduction).toBe(0);
    expect(r.status).toBe('PRESENT');
  });

  it('EXEMPT on approved leave → LEAVE (not generic present)', () => {
    const date = d(2026, 8, 3);
    const r = dayDeduction(
      date,
      dayInput(date, { clockIn: null, clockOut: null }),
      emptyContext({
        isAttendanceExempt: () => true,
        isOnApprovedLeave: () => true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.status).toBe('LEAVE');
  });

  it('scheduled / present days: whole days, Saturday = 1, never 0.5', () => {
    // Aug 2026: 31 days, Sundays 2/9/16/23/30 → 26 Mon–Sat working days.
    const absentKey = '2026-08-03'; // Monday, no scan
    const satKey = '2026-08-08'; // Saturday, present
    const missingOutKey = '2026-08-12'; // Wednesday, clock-in only
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) => {
      if (key === absentKey) return dayInput(date, { clockIn: null, clockOut: null });
      if (key === missingOutKey) return dayInput(date, { clockOut: null });
      return dayInput(date);
    });
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(daily.get(satKey)).toBeDefined();
    expect(result.scheduledDays).toBe(26);
    // Missing clock-out is still a present day (its 0.5 is a pay deduction only).
    expect(result.presentDays).toBe(25);
    expect(Number.isInteger(result.presentDays)).toBe(true);
    expect(result.absentDays).toBe(1.5);
    expect(result.paidDays).toBe(28.5);
  });

  it('"Present this month" / exempt with no scans → present all working days, paid 30', () => {
    for (const month of [2, 8, 9]) {
      const leaveKey = `2026-${String(month).padStart(2, '0')}-04`;
      const result = summarizeMonthAbsence({
        month,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: new Map(), // missing from the export: no logs at all
        context: emptyContext({
          isAttendanceExempt: () => true,
          isOnApprovedLeave: (date) => dateToYyyyMmDd(date) === leaveKey,
        }),
      });
      expect(result.paidDays).toBe(30);
      expect(result.absentDays).toBe(0);
      expect(result.fullyAbsentWorkingDays).toBe(false);
      // Approved leave still shows as leave, not present.
      const leaveIsWorkingDay = d(2026, month, 4).getUTCDay() !== 0;
      expect(result.presentDays).toBe(
        result.scheduledDays - (leaveIsWorkingDay ? 1 : 0),
      );
    }
  });

  it('joined Aug 17, "Present this month", no scans → paid 14, absent 0', () => {
    const join = d(2026, 8, 17);
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: new Map(),
      context: emptyContext({ isAttendanceExempt: () => true }),
    });
    expect(result.employedDays).toBe(14);
    expect(result.paidDays).toBe(14);
    expect(result.absentDays).toBe(0);
    expect(result.fullyAbsentWorkingDays).toBe(false);
    // Aug 17–31 has 13 Mon–Sat days; nothing before the 17th is counted.
    expect(result.scheduledDays).toBe(13);
    expect(result.presentDays).toBe(13);
    expect([...result.byDate.keys()].every((key) => key >= '2026-08-17')).toBe(true);
  });

  it('left Aug 15, "Present this month", no scans → paid 15, absent 0', () => {
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: d(2026, 8, 15) }],
      dailyLogsByDate: new Map(),
      context: emptyContext({ isAttendanceExempt: () => true }),
    });
    expect(result.employedDays).toBe(15);
    expect(result.paidDays).toBe(15);
    expect(result.absentDays).toBe(0);
    // Aug 1–15 has 13 Mon–Sat days (Sundays 2 and 9); nothing after the 15th.
    expect(result.scheduledDays).toBe(13);
    expect(result.presentDays).toBe(13);
    expect([...result.byDate.keys()].every((key) => key <= '2026-08-15')).toBe(true);
  });

  it('joiner Aug 17 → scheduled / present count only the employed window', () => {
    const join = d(2026, 8, 17);
    const daily = logsForMonth(8, 2026, join, null, (date) => dayInput(date));
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    // Aug 17–31: 15 days, Sundays 23 and 30 → 13 working days.
    expect(result.scheduledDays).toBe(13);
    expect(result.presentDays).toBe(13);
  });

  it('Saturday no-scan absence is 1 (same as weekday)', () => {
    const sat = d(2026, 8, 8);
    const r = dayDeduction(
      sat,
      dayInput(sat, { clockIn: null, clockOut: null }),
      emptyContext(),
    );
    expect(r.deduction).toBe(1);
    expect(r.status).toBe('ABSENT');
  });

  it('leave balance Mon–Sat → 5.5 (unchanged; separate from payroll)', () => {
    function standardSchedule(date: Date): {
      isWorkingDay: boolean;
      isHalfDay: boolean;
    } {
      const dow = date.getUTCDay();
      if (dow === 0) return { isWorkingDay: false, isHalfDay: false };
      if (dow === 6) return { isWorkingDay: true, isHalfDay: true };
      return { isWorkingDay: true, isHalfDay: false };
    }
    // 2026-10-05 Mon … 2026-10-10 Sat
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 10),
      standardSchedule,
      [],
    );
    expect(Number(result.totalDays)).toBe(5.5);
    expect(FULLY_ABSENT_NO_PAY_NOTE).toBe('Absent all working days - no pay.');
  });

  describe('schedule-aware dayKind (Sat-off / default parity)', () => {
    const satOffKind = (date: Date) => {
      const dow = date.getUTCDay();
      if (dow === 0 || dow === 6) {
        return 'DAY_OFF' as const;
      }
      return 'WORKING' as const;
    };

    it('full month Sat/Sun-off, no absences → paid 30, attended 21', () => {
      const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
        dayInput(date),
      );
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext({ dayKind: satOffKind }),
      });
      expect(result.employedDays).toBe(30);
      expect(result.paidDays).toBe(30);
      expect(result.scheduledDays).toBe(21);
      expect(result.presentDays).toBe(21);
      expect(result.absentDays).toBe(0);
    });

    it('joiner Aug 24 no absences → employed/paid 7 (attended ≤ 7)', () => {
      const join = d(2026, 8, 24);
      const daily = logsForMonth(8, 2026, join, null, (date) => dayInput(date));
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: [{ startDate: join, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(result.employedDays).toBe(7);
      expect(result.paidDays).toBe(7);
      expect(result.presentDays).toBe(7);
      expect(result.scheduledDays).toBe(7);
    });

    it('Feb full month fully absent → paid 0 (not 2)', () => {
      const daily = logsForMonth(2, 2026, fullContractStart, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const result = summarizeMonthAbsence({
        month: 2,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(result.paidDays).toBe(0);
      expect(result.fullyAbsentWorkingDays).toBe(true);
    });

    it('joiner Feb 15 fully absent → paid 0', () => {
      const join = d(2026, 2, 15);
      const daily = logsForMonth(2, 2026, join, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const result = summarizeMonthAbsence({
        month: 2,
        year: 2026,
        contracts: [{ startDate: join, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(result.employedDays).toBe(16);
      expect(result.paidDays).toBe(0);
      expect(result.fullyAbsentWorkingDays).toBe(true);
    });

    it('Sat-off schedule + no scan Saturday → deduction 0, DAY_OFF', () => {
      const sat = d(2026, 10, 10); // Saturday
      const r = dayDeduction(
        sat,
        dayInput(sat, { clockIn: null, clockOut: null }),
        emptyContext({ dayKind: satOffKind }),
      );
      expect(r.status).toBe('DAY_OFF');
      expect(r.deduction).toBe(0);
    });

    it('Sat-off schedule + scan Saturday → WORKED_ON_DAY_OFF, deduction 0', () => {
      const sat = d(2026, 10, 10);
      const r = dayDeduction(
        sat,
        dayInput(sat, { clockIn: '09:00', clockOut: '12:00' }),
        emptyContext({ dayKind: satOffKind }),
      );
      expect(r.status).toBe('WORKED_ON_DAY_OFF');
      expect(r.deduction).toBe(0);
    });

    it('default schedule Saturday no scan → deduction 1 (same as weekday)', () => {
      const sat = d(2026, 10, 10);
      const r = dayDeduction(
        sat,
        dayInput(sat, { clockIn: null, clockOut: null }),
        emptyContext(),
      );
      expect(r.status).toBe('ABSENT');
      expect(r.deduction).toBe(1);
    });

    it('Sat-off fully-absent month counts only Mon–Fri', () => {
      const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const result = summarizeMonthAbsence({
        month: 8,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext({ dayKind: satOffKind }),
      });
      // Aug 2026: 31 days, 5 Sundays + 5 Saturdays off → 21 Mon–Fri duty days.
      expect(result.scheduledDays).toBe(21);
      expect(result.fullyAbsentWorkingDays).toBe(true);
      expect(result.paidDays).toBe(0);
      expect(result.byDate.get('2026-08-01')?.status).toBe('DAY_OFF'); // Sat
      expect(result.byDate.get('2026-08-02')?.status).toBe('DAY_OFF'); // Sun
      expect(result.byDate.get('2026-08-03')?.status).toBe('ABSENT'); // Mon
    });

    it('mid-month schedule change uses each date\'s dayKind', () => {
      // Before the 15th: Sat-off; from the 15th: default (Sat half / working).
      const dayKind = (date: Date) => {
        if (date.getUTCDate() < 15) {
          return satOffKind(date);
        }
        const dow = date.getUTCDay();
        if (dow === 0) {
          return 'DAY_OFF' as const;
        }
        if (dow === 6) {
          return 'HALF_DAY' as const;
        }
        return 'WORKING' as const;
      };
      const satEarly = d(2026, 8, 8); // Sat before change
      const satLate = d(2026, 8, 15); // Sat on/after change
      expect(
        dayDeduction(
          satEarly,
          dayInput(satEarly, { clockIn: null, clockOut: null }),
          emptyContext({ dayKind }),
        ).status,
      ).toBe('DAY_OFF');
      expect(
        dayDeduction(
          satLate,
          dayInput(satLate, { clockIn: null, clockOut: null }),
          emptyContext({ dayKind }),
        ).status,
      ).toBe('ABSENT');
    });
  });
});

/** Stored daily logs as the attendance recompute writes them (0 outside the window). */
function storedLogsFromSummary(
  month: number,
  year: number,
  byDate: Map<string, { deduction: number }>,
  isHoliday: (date: Date) => boolean = () => false,
): Array<{
  date: Date;
  dayDeduction: number;
  isHoliday: boolean;
  isWeekend: boolean;
  isHalfDay: boolean;
}> {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = d(year, month, index + 1);
    const dow = date.getUTCDay();
    return {
      date,
      dayDeduction: byDate.get(dateToYyyyMmDd(date))?.deduction ?? 0,
      isHoliday: isHoliday(date),
      isWeekend: dow === 0,
      isHalfDay: dow === 6,
    };
  });
}

describe('isFullyAbsentFromStoredLogs (payroll run) matches summarizeMonthAbsence', () => {
  const fullContractStart = d(2020, 1, 1);
  const wholeMonth = (month: number, year: number) => [
    {
      windowStart: d(year, month, 1),
      windowEnd: new Date(Date.UTC(year, month, 0)),
    },
  ];

  it('fully absent Feb / Aug / Sep → payroll sees fully absent, paid 0', () => {
    for (const month of [2, 8, 9]) {
      const daily = logsForMonth(month, 2026, fullContractStart, null, (date) =>
        dayInput(date, { clockIn: null, clockOut: null }),
      );
      const summary = summarizeMonthAbsence({
        month,
        year: 2026,
        contracts: [{ startDate: fullContractStart, endDate: null }],
        dailyLogsByDate: daily,
        context: emptyContext(),
      });
      expect(
        isFullyAbsentFromStoredLogs(
          summary.paidDays,
          storedLogsFromSummary(month, 2026, summary.byDate),
          wholeMonth(month, 2026),
        ),
      ).toBe(true);
    }
  });

  it('3 absences → paid 27 and payroll does not treat it as fully absent', () => {
    const absent = new Set(['2026-08-03', '2026-08-08', '2026-08-12']); // Mon, Sat, Wed
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date, key) =>
      absent.has(key) ? dayInput(date, { clockIn: null, clockOut: null }) : dayInput(date),
    );
    const summary = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(summary.paidDays).toBe(27);
    expect(
      isFullyAbsentFromStoredLogs(
        summary.paidDays,
        storedLogsFromSummary(8, 2026, summary.byDate),
        wholeMonth(8, 2026),
      ),
    ).toBe(false);
  });

  it('one approved leave day in an otherwise absent month → not fully absent', () => {
    const leaveKey = '2026-08-06';
    const daily = logsForMonth(8, 2026, fullContractStart, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const summary = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext({
        isOnApprovedLeave: (date) => dateToYyyyMmDd(date) === leaveKey,
      }),
    });
    expect(summary.paidDays).toBe(summary.employedDays - summary.absentDays);
    expect(
      isFullyAbsentFromStoredLogs(
        summary.paidDays,
        storedLogsFromSummary(8, 2026, summary.byDate),
        wholeMonth(8, 2026),
      ),
    ).toBe(false);
  });

  it('joiner Aug 17, absent from the 17th → fully absent within the employed window only', () => {
    const join = d(2026, 8, 17);
    const daily = logsForMonth(8, 2026, join, null, (date) =>
      dayInput(date, { clockIn: null, clockOut: null }),
    );
    const summary = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    // Days before the 17th are stored with deduction 0 and must not block the rule.
    const stored = storedLogsFromSummary(8, 2026, summary.byDate);
    expect(stored.find((log) => dateToYyyyMmDd(log.date) === '2026-08-10')?.dayDeduction).toBe(0);
    expect(
      isFullyAbsentFromStoredLogs(summary.paidDays, stored, [
        { windowStart: join, windowEnd: d(2026, 8, 31) },
      ]),
    ).toBe(true);
  });

  it('Sat-off schedule: Saturdays (isWeekend) are excluded from fully-absent', () => {
    // Mon–Fri all deduction 1; Sat/Sun isWeekend → fully absent on duty days.
    const stored = Array.from({ length: 31 }, (_, index) => {
      const date = d(2026, 8, index + 1);
      const dow = date.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      return {
        date,
        dayDeduction: isWeekend ? 0 : 1,
        isHoliday: false,
        isWeekend,
      };
    });
    expect(isFullyAbsentFromStoredLogs(0, stored, wholeMonth(8, 2026))).toBe(true);
  });

  it('legacy stored logs without isWeekend still treat only Sunday as off', () => {
    // Saturdays present (0) without isWeekend → still duty days → not fully absent.
    const stored = Array.from({ length: 31 }, (_, index) => {
      const date = d(2026, 8, index + 1);
      const dow = date.getUTCDay();
      return {
        date,
        dayDeduction: dow === 0 || dow === 6 ? 0 : 1,
        isHoliday: false,
      };
    });
    expect(isFullyAbsentFromStoredLogs(0, stored, wholeMonth(8, 2026))).toBe(false);
  });

  it('a missing punch (0.5) never counts as a full absence', () => {
    const stored = Array.from({ length: 30 }, (_, index) => {
      const date = d(2026, 9, index + 1);
      return {
        date,
        dayDeduction: date.getUTCDay() === 6 ? 0.5 : date.getUTCDay() === 0 ? 0 : 1,
        isHoliday: false,
      };
    });
    expect(isFullyAbsentFromStoredLogs(0, stored, wholeMonth(9, 2026))).toBe(false);
  });

  it('paid days above 0 → never fully absent', () => {
    const stored = [{ date: d(2026, 8, 3), dayDeduction: 1, isHoliday: false }];
    expect(isFullyAbsentFromStoredLogs(1, stored, wholeMonth(8, 2026))).toBe(false);
  });
});
