import { BadRequestException } from '@nestjs/common';
import {
  NO_WORKING_DAYS_MESSAGE,
  calculateLeaveDaysForRange,
  calculateLeaveDaysFromPeriods,
} from './leave-days.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Mon–Fri full, Sat half, Sun off - standard CCECC schedule. */
function standardSchedule(date: Date): {
  isWorkingDay: boolean;
  isHalfDay: boolean;
} {
  const dow = date.getUTCDay();
  if (dow === 0) {
    return { isWorkingDay: false, isHalfDay: false };
  }
  if (dow === 6) {
    return { isWorkingDay: true, isHalfDay: true };
  }
  return { isWorkingDay: true, isHalfDay: false };
}

describe('leave-days.util', () => {
  it('Mon–Fri → 5', () => {
    // 2026-10-05 Mon … 2026-10-09 Fri
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 9),
      standardSchedule,
      [],
    );
    expect(Number(result.totalDays)).toBe(5);
  });

  it('Mon–Sat → 5.5', () => {
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 10),
      standardSchedule,
      [],
    );
    expect(Number(result.totalDays)).toBe(5.5);
  });

  it('Mon–Mon (includes a Sunday) → 6.5', () => {
    // Mon 5 Oct … Mon 12 Oct: 5 full + Sat 0.5 + Sun 0 + Mon 1 = 6.5
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 12),
      standardSchedule,
      [],
    );
    expect(Number(result.totalDays)).toBe(6.5);
  });

  it('public holiday on a Wednesday → holiday costs 0', () => {
    // Mon–Fri with Wed holiday: 4
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 9),
      standardSchedule,
      [{ date: d(2026, 10, 7), isRecurring: false, name: 'Test Holiday' }],
    );
    expect(Number(result.totalDays)).toBe(4);
    const wed = result.breakdown.find(
      (row) => row.date.getUTCDate() === 7,
    );
    expect(wed?.type).toBe('holiday');
    expect(wed?.weight).toBe(0);
  });

  it('single weekday morning → 0.5', () => {
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 5),
      standardSchedule,
      [],
      'MORNING',
    );
    expect(Number(result.totalDays)).toBe(0.5);
  });

  it('Saturday alone → 0.5', () => {
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 10),
      d(2026, 10, 10),
      standardSchedule,
      [],
    );
    expect(Number(result.totalDays)).toBe(0.5);
  });

  it('Sunday alone → 0, and submission is blocked', () => {
    expect(() =>
      calculateLeaveDaysFromPeriods(
        [{ startDate: d(2026, 10, 11), endDate: d(2026, 10, 11) }],
        standardSchedule,
        [],
      ),
    ).toThrow(BadRequestException);
    try {
      calculateLeaveDaysFromPeriods(
        [{ startDate: d(2026, 10, 11), endDate: d(2026, 10, 11) }],
        standardSchedule,
        [],
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        NO_WORKING_DAYS_MESSAGE,
      );
    }
  });

  it('Mon–Sun on Sat/Sun-off schedule charges 5', () => {
    const satSunOff = (date: Date) => {
      const dow = date.getUTCDay();
      return {
        isWorkingDay: dow >= 1 && dow <= 5,
        isHalfDay: false,
      };
    };
    // Mon 5 Oct … Sun 11 Oct
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 11),
      satSunOff,
      [],
    );
    expect(Number(result.totalDays)).toBe(5);
  });

  it('employee whose schedule changed mid-range uses the right schedule per date', () => {
    // Before Wed: Mon–Fri only (no Saturday). From Wed: standard with Sat half.
    const resolve = (date: Date) => {
      if (date.getUTCDate() < 7) {
        const dow = date.getUTCDay();
        return {
          isWorkingDay: dow >= 1 && dow <= 5,
          isHalfDay: false,
        };
      }
      return standardSchedule(date);
    };
    // Mon 5 – Sat 10: Mon Tue (full) + Wed Thu Fri (full) + Sat half = 5.5
    // Without mid-change Sat would still be 0.5 under standard; use Fri–Sat crossing change
    // Mon–Tue under old (2) + Wed–Fri (3) + Sat half under new (0.5) = 5.5
    const result = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 10),
      resolve,
      [],
    );
    expect(Number(result.totalDays)).toBe(5.5);

    // If new schedule made Saturday non-working after change point:
    const resolveSatOff = (date: Date) => {
      if (date.getUTCDate() >= 10) {
        return { isWorkingDay: false, isHalfDay: false };
      }
      return standardSchedule(date);
    };
    const result2 = calculateLeaveDaysForRange(
      d(2026, 10, 5),
      d(2026, 10, 10),
      resolveSatOff,
      [],
    );
    // Mon–Fri = 5, Sat off = 0 → 5
    expect(Number(result2.totalDays)).toBe(5);
  });
});
