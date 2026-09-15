import { describe, expect, it } from '@jest/globals';
import {
  buildOvertimeScheduleNote,
  calculateOvertimeHours,
  type OvertimeDayContext,
} from './overtime-hours.util';

const WEEKDAY: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
};

const HALF_DAY: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: true,
  morningStart: '08:30',
  morningEnd: '12:30',
};

const OFF_DAY: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: false,
  isHalfDay: false,
  morningStart: null,
  morningEnd: null,
};

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

describe('calculateOvertimeHours', () => {
  it('splits a weekday evening into regular then night', () => {
    const result = calculateOvertimeHours(
      utcDate('2026-09-14'),
      '18:00',
      '23:00',
      WEEKDAY,
    );
    expect(result).toEqual({
      regularHours: 4,
      nightHours: 1,
      weekendHours: 0,
      holidayHours: 0,
    });
  });

  it('classifies a non-working day as weekend, including overnight', () => {
    const result = calculateOvertimeHours(
      utcDate('2026-09-13'),
      '09:00',
      '17:00',
      OFF_DAY,
    );
    expect(result.weekendHours).toBe(8);
    expect(result.regularHours).toBe(0);
    expect(result.nightHours).toBe(0);
  });

  it('keeps Saturday morning regular and afternoon as weekend on a half day', () => {
    const result = calculateOvertimeHours(
      utcDate('2026-09-12'),
      '08:00',
      '16:00',
      HALF_DAY,
    );
    expect(result.regularHours).toBe(4);
    expect(result.weekendHours).toBe(4);
    expect(result.nightHours).toBe(0);
  });

  it('classifies the entire interval as holiday when the calendar says so', () => {
    const result = calculateOvertimeHours(
      utcDate('2026-09-12'),
      '08:00',
      '16:00',
      { ...HALF_DAY, isHoliday: true },
    );
    expect(result.holidayHours).toBe(8);
    expect(result.weekendHours).toBe(0);
    expect(result.regularHours).toBe(0);
  });

  it('lets half-day overflow beat night hours', () => {
    const result = calculateOvertimeHours(
      utcDate('2026-09-12'),
      '21:00',
      '23:00',
      HALF_DAY,
    );
    expect(result.weekendHours).toBe(2);
    expect(result.nightHours).toBe(0);
  });

  it('classifies 22:00–06:00 as night on a full working day', () => {
    const result = calculateOvertimeHours(
      utcDate('2026-09-14'),
      '21:00',
      '23:00',
      WEEKDAY,
    );
    expect(result.regularHours).toBe(1);
    expect(result.nightHours).toBe(1);
  });
});

describe('buildOvertimeScheduleNote', () => {
  it('describes a Saturday half day', () => {
    expect(buildOvertimeScheduleNote(utcDate('2026-09-12'), HALF_DAY)).toBe(
      'Saturday half day — afternoon classified as weekend',
    );
  });

  it('describes a Sunday off day', () => {
    expect(buildOvertimeScheduleNote(utcDate('2026-09-13'), OFF_DAY)).toBe(
      'Sunday is a non-working day — hours classified as weekend',
    );
  });

  it('returns null on a holiday or full working day', () => {
    expect(
      buildOvertimeScheduleNote(utcDate('2026-09-14'), {
        ...WEEKDAY,
        isHoliday: true,
      }),
    ).toBeNull();
    expect(buildOvertimeScheduleNote(utcDate('2026-09-14'), WEEKDAY)).toBeNull();
  });
});
