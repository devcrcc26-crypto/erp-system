import { describe, expect, it } from '@jest/globals';
import {
  calendarDaysInclusive,
  rangesOverlap,
  siteNameForDate,
  validateSiteAssignmentDates,
} from './site-assignment.util';
import {
  dayDeduction,
  summarizeMonthAbsence,
  type DayDeductionContext,
  type DayDeductionDayInput,
} from '../../../attendance/application/utils/day-deduction.util';

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

function emptyContext(
  overrides: Partial<DayDeductionContext> = {},
): DayDeductionContext {
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
    clockIn: null,
    clockOut: null,
    isLastExportDay: false,
    scheduledEnd: '17:30',
    ...partial,
  };
}

describe('site-assignment.util', () => {
  it('rejects end before start', () => {
    expect(() =>
      validateSiteAssignmentDates(d(2026, 8, 10), d(2026, 8, 1)),
    ).toThrow(/End date/);
  });

  it('detects overlapping assignments', () => {
    const a = { startDate: d(2026, 8, 1), endDate: d(2026, 8, 15) };
    const b = { startDate: d(2026, 8, 10), endDate: d(2026, 8, 20) };
    expect(rangesOverlap(a, b)).toBe(true);
    expect(
      rangesOverlap(
        { startDate: d(2026, 8, 1), endDate: d(2026, 8, 5) },
        { startDate: d(2026, 8, 10), endDate: d(2026, 8, 20) },
      ),
    ).toBe(false);
  });

  it('calendar days inclusive', () => {
    expect(calendarDaysInclusive(d(2026, 8, 1), d(2026, 8, 15))).toBe(15);
  });

});

describe('dayDeduction with site assignments', () => {
  const join = d(2020, 1, 1);
  const site = 'Dire Dawa';

  function siteContext(
    start: Date,
    end: Date,
    siteName = site,
  ): DayDeductionContext {
    return emptyContext({
      siteNameForDate: (date) => siteNameForDate(date, [
        { startDate: start, endDate: end, siteName },
      ]),
    });
  }

  function fullMonthLogs(
    month: number,
    year: number,
    builder: (date: Date, key: string) => DayDeductionDayInput,
  ): Map<string, DayDeductionDayInput> {
    const map = new Map<string, DayDeductionDayInput>();
    const summary = summarizeMonthAbsence({
      month,
      year,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: new Map(),
      context: emptyContext(),
    });
    for (const key of summary.byDate.keys()) {
      const day = Number(key.slice(8, 10));
      map.set(key, builder(d(year, month, day), key));
    }
    return map;
  }

  it('on site all month, no scans → paid 30', () => {
    const daily = fullMonthLogs(8, 2026, (date) => dayInput(date));
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: siteContext(d(2026, 8, 1), d(2026, 8, 31)),
    });
    expect(result.paidDays).toBe(30);
    expect(result.absentDays).toBe(0);
  });

  it('on site days 1–15 only → absent from 16th Mon–Sat onward', () => {
    const daily = fullMonthLogs(8, 2026, (date) => dayInput(date));
    const result = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: siteContext(d(2026, 8, 1), d(2026, 8, 15)),
    });
    expect(result.paidDays).toBeLessThan(30);
    expect(result.absentDays).toBeGreaterThan(0);
  });

  it('on site includes Saturday, no scan → deduction 0', () => {
    const sat = d(2026, 8, 8);
    const r = dayDeduction(
      sat,
      dayInput(sat),
      siteContext(d(2026, 8, 1), d(2026, 8, 31)),
    );
    expect(r.deduction).toBe(0);
    expect(r.status).toBe('ON_SITE');
  });

  it('cancelling approved assignment → days become absent again', () => {
    const daily = fullMonthLogs(8, 2026, (date) => dayInput(date));
    const approved = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: siteContext(d(2026, 8, 1), d(2026, 8, 31)),
    });
    const cancelled = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: emptyContext(),
    });
    expect(approved.absentDays).toBe(0);
    expect(cancelled.absentDays).toBeGreaterThan(0);
  });

  it('shortening end date → days after new end become absent', () => {
    const daily = fullMonthLogs(8, 2026, (date) => dayInput(date));
    const full = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: siteContext(d(2026, 8, 1), d(2026, 8, 31)),
    });
    const shortened = summarizeMonthAbsence({
      month: 8,
      year: 2026,
      contracts: [{ startDate: join, endDate: null }],
      dailyLogsByDate: daily,
      context: siteContext(d(2026, 8, 1), d(2026, 8, 15)),
    });
    expect(full.absentDays).toBe(0);
    expect(shortened.paidDays).toBeLessThan(full.paidDays);
  });

  it('scanned at HQ on a site day → ON_SITE, deduction 0', () => {
    const day = d(2026, 8, 5);
    const r = dayDeduction(
      day,
      dayInput(day, { clockIn: '08:00', clockOut: '17:30' }),
      siteContext(d(2026, 8, 1), d(2026, 8, 31)),
    );
    expect(r.deduction).toBe(0);
    expect(r.status).toBe('ON_SITE');
    expect(r.siteName).toBe(site);
  });
});
