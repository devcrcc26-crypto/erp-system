import { describe, expect, it } from '@jest/globals';
import {
  computeSelectableOvertimeWindows,
  enumerateWindowTimes,
  isIntervalInsideSelectableWindows,
} from './overtime-selectable-windows.util';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';

const FULL = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
  leaveExcludedWindows: [] as Array<{ start: string; end: string }>,
  hasFullDayLeave: false,
};

const HALF = {
  ...FULL,
  isHalfDay: true,
  afternoonStart: null,
  afternoonEnd: null,
};

const OFF = {
  ...FULL,
  isWorkingDay: false,
  isHalfDay: false,
  morningStart: null,
  morningEnd: null,
  afternoonStart: null,
  afternoonEnd: null,
};

describe('computeSelectableOvertimeWindows', () => {
  it('1 — Monday full day: 00:00–08:30 and 17:30–24:00; lunch not selectable', () => {
    expect(POLICY_DEFAULTS.lunchCountsAsOvertime).toBe(false);
    const result = computeSelectableOvertimeWindows(FULL);
    expect(result.dayKind).toBe('FULL_WORKING');
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
    expect(
      isIntervalInsideSelectableWindows('12:30', '13:30', result.windows),
    ).toBe(false);
  });

  it('2 — Saturday half day: 00:00–08:30 and 12:30–24:00 (pre-morning OT allowed)', () => {
    const result = computeSelectableOvertimeWindows(HALF);
    expect(result.dayKind).toBe('HALF_DAY');
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '12:30', end: '24:00' },
    ]);
    expect(
      isIntervalInsideSelectableWindows('00:00', '06:00', result.windows),
    ).toBe(true);
    expect(
      isIntervalInsideSelectableWindows('06:00', '08:00', result.windows),
    ).toBe(true);
    expect(
      isIntervalInsideSelectableWindows('13:00', '17:00', result.windows),
    ).toBe(true);
    expect(
      isIntervalInsideSelectableWindows('08:30', '12:30', result.windows),
    ).toBe(false);
  });

  it('3 — Sunday / non-working: whole day', () => {
    const result = computeSelectableOvertimeWindows(OFF);
    expect(result.dayKind).toBe('NON_WORKING');
    expect(result.windows).toEqual([{ start: '00:00', end: '24:00' }]);
    expect(
      isIntervalInsideSelectableWindows('08:00', '12:00', result.windows),
    ).toBe(true);
  });

  it('Sat-off employee Saturday → NON_WORKING whole day (WEEKEND classification)', () => {
    // Same shape as Sunday off — schedule isWorkingDay false for Saturday.
    const satOff = {
      isHoliday: false,
      isWorkingDay: false,
      isHalfDay: false,
      morningStart: null as string | null,
      morningEnd: null as string | null,
      afternoonStart: null as string | null,
      afternoonEnd: null as string | null,
      leaveExcludedWindows: [] as Array<{ start: string; end: string }>,
      hasFullDayLeave: false,
    };
    const result = computeSelectableOvertimeWindows(satOff);
    expect(result.dayKind).toBe('NON_WORKING');
    expect(result.windows).toEqual([{ start: '00:00', end: '24:00' }]);
  });

  it('4 — end at or before start is not inside windows', () => {
    const result = computeSelectableOvertimeWindows(FULL);
    expect(
      isIntervalInsideSelectableWindows('18:00', '18:00', result.windows),
    ).toBe(false);
    expect(
      isIntervalInsideSelectableWindows('19:00', '18:00', result.windows),
    ).toBe(false);
  });

  it('9 — Tue 00:00–09:00 overlaps working hours → rejected', () => {
    const result = computeSelectableOvertimeWindows(FULL);
    expect(
      isIntervalInsideSelectableWindows('00:00', '09:00', result.windows),
    ).toBe(false);
  });

  it('11 — full-day leave → no windows', () => {
    const result = computeSelectableOvertimeWindows({
      ...FULL,
      hasFullDayLeave: true,
    });
    expect(result.dayKind).toBe('FULL_DAY_LEAVE');
    expect(result.windows).toEqual([]);
    expect(result.message).toBe("You're on approved leave this day.");
  });

  it('half-day leave morning excludes morning OT window portion', () => {
    const result = computeSelectableOvertimeWindows({
      ...FULL,
      leaveExcludedWindows: [{ start: '08:30', end: '12:30' }],
    });
    // Morning leave does not change OT windows (already outside schedule).
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
  });

  it('half-day leave on Saturday morning removes early window slice only if overlapping', () => {
    const result = computeSelectableOvertimeWindows({
      ...HALF,
      leaveExcludedWindows: [{ start: '00:00', end: '08:30' }],
    });
    expect(result.windows).toEqual([{ start: '12:30', end: '24:00' }]);
  });
});

describe('enumerateWindowTimes', () => {
  it('start times exclude window end; end times include 24:00', () => {
    const evening = { start: '17:30', end: '24:00' };
    const starts = enumerateWindowTimes(evening, { forEndTime: false });
    expect(starts[0]).toBe('17:30');
    expect(starts).not.toContain('24:00');
    const ends = enumerateWindowTimes(evening, {
      forEndTime: true,
      afterMinutes: 23 * 60,
    });
    expect(ends).toContain('24:00');
  });
});
