import { describe, expect, it } from '@jest/globals';
import {
  dayDeduction,
  summarizeMonthAbsence,
  type DayDeductionContext,
  type DayDeductionDayInput,
} from './day-deduction.util';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';

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
    fieldMovementCoverage: () => 'NONE',
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

  it('full month, no issues → paid 30', () => {
    const month = 8;
    const year = 2026;
    const daily = logsForMonth(month, year, fullContractStart, null, (date) =>
      dayInput(date),
    );
    const result = summarizeMonthAbsence({
      month,
      year,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.paidDays).toBe(30);
    expect(result.absentDays).toBe(0);
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

  it('early departure, field movement pending → paid 29.5', () => {
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
        fieldMovementCoverage: (date) =>
          dateToYyyyMmDd(date) === key ? 'PENDING' : 'NONE',
      }),
    });
    expect(result.paidDays).toBe(29.5);
    expect(result.byDate.get(key)?.status).toBe('FIELD_MOVEMENT_PENDING');
  });

  it('late arrival only → paid 30', () => {
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
  });

  it('absent every Mon–Sat in June with 4 Sundays → paid 4', () => {
    const daily = logsForMonth(6, 2026, fullContractStart, null, (date) => {
      if (date.getUTCDay() === 0) {
        return dayInput(date, { clockIn: null, clockOut: null });
      }
      return dayInput(date, { clockIn: null, clockOut: null });
    });
    const result = summarizeMonthAbsence({
      month: 6,
      year: 2026,
      contracts: [{ startDate: fullContractStart, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(result.paidDays).toBe(4);
    expect(result.absentDays).toBe(26);
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

  it('WFH scoped to one department — others still deducted without scan', () => {
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

  it('example month → absent 2.5, paid 27.5', () => {
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
});
