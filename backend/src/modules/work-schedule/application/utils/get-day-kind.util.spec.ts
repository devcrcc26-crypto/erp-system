import { describe, expect, it } from '@jest/globals';
import {
  defaultScheduleDayFlags,
  getDayKind,
  isDutyDayKind,
  resolveDayKindForDate,
} from './get-day-kind.util';

describe('getDayKind', () => {
  it('holiday wins over a working schedule day', () => {
    expect(
      getDayKind({ isHoliday: true, isWorkingDay: true, isHalfDay: false }),
    ).toBe('HOLIDAY');
  });

  it('non-working schedule → DAY_OFF', () => {
    expect(
      getDayKind({ isHoliday: false, isWorkingDay: false, isHalfDay: false }),
    ).toBe('DAY_OFF');
  });

  it('half-day schedule → HALF_DAY', () => {
    expect(
      getDayKind({ isHoliday: false, isWorkingDay: true, isHalfDay: true }),
    ).toBe('HALF_DAY');
  });

  it('full working → WORKING', () => {
    expect(
      getDayKind({ isHoliday: false, isWorkingDay: true, isHalfDay: false }),
    ).toBe('WORKING');
  });
});

describe('defaultScheduleDayFlags / resolveDayKindForDate', () => {
  it('fallback: Mon–Fri working, Sat half, Sun off', () => {
    expect(defaultScheduleDayFlags(0)).toEqual({
      isWorkingDay: false,
      isHalfDay: false,
    });
    expect(defaultScheduleDayFlags(3)).toEqual({
      isWorkingDay: true,
      isHalfDay: false,
    });
    expect(defaultScheduleDayFlags(6)).toEqual({
      isWorkingDay: true,
      isHalfDay: true,
    });
  });

  it('Sat-off schedule → DAY_OFF on Saturday', () => {
    const sat = new Date(Date.UTC(2026, 9, 10)); // Sat
    expect(
      resolveDayKindForDate(sat, false, {
        isWorkingDay: false,
        isHalfDay: false,
      }),
    ).toBe('DAY_OFF');
    expect(isDutyDayKind('DAY_OFF')).toBe(false);
  });
});
