import { describe, expect, it } from '@jest/globals';
import {
  computeSelectableOvertimeWindows,
  entryToSameDayOccupiedWindow,
  enumerateWindowTimes,
  isIntervalInsideSelectableWindows,
  isSameDayOvertimeIntervalAllowed,
  subtractOccupiedFromWindows,
  timeIntervalsOverlap,
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
  it('1 - Monday full day: duty hours hidden from start windows', () => {
    expect(POLICY_DEFAULTS.lunchCountsAsOvertime).toBe(false);
    const result = computeSelectableOvertimeWindows(FULL);
    expect(result.dayKind).toBe('FULL_WORKING');
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
    expect(
      isSameDayOvertimeIntervalAllowed('18:00', '22:00', result.windows),
    ).toBe(true);
    expect(
      isSameDayOvertimeIntervalAllowed('09:00', '12:00', result.windows),
    ).toBe(false);
  });

  it('2 - Saturday half day: before morning and after morning end', () => {
    const result = computeSelectableOvertimeWindows(HALF);
    expect(result.dayKind).toBe('HALF_DAY');
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '12:30', end: '24:00' },
    ]);
    expect(
      isSameDayOvertimeIntervalAllowed('13:00', '20:00', result.windows),
    ).toBe(true);
  });

  it('site assignment day: full calendar day for starts', () => {
    const result = computeSelectableOvertimeWindows({
      ...FULL,
      scheduledHoursClaimable: true,
    });
    expect(result.windows).toEqual([{ start: '00:00', end: '24:00' }]);
    expect(
      isSameDayOvertimeIntervalAllowed('09:00', '18:00', result.windows),
    ).toBe(true);
  });

  it('3 - Sunday / non-working: whole day', () => {
    const result = computeSelectableOvertimeWindows(OFF);
    expect(result.dayKind).toBe('NON_WORKING');
    expect(result.windows).toEqual([{ start: '00:00', end: '24:00' }]);
  });

  it('4 - end at or before start is not allowed', () => {
    const result = computeSelectableOvertimeWindows(FULL);
    expect(
      isSameDayOvertimeIntervalAllowed('18:00', '18:00', result.windows),
    ).toBe(false);
  });

  it('11 - full-day leave duty hours excluded', () => {
    const result = computeSelectableOvertimeWindows({
      ...FULL,
      leaveExcludedWindows: [{ start: '08:30', end: '17:30' }],
    });
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
  });
});

describe('isIntervalInsideSelectableWindows (legacy full-window check)', () => {
  it('requires the whole interval inside one window', () => {
    const result = computeSelectableOvertimeWindows(FULL);
    expect(
      isIntervalInsideSelectableWindows('18:00', '20:00', result.windows),
    ).toBe(true);
    expect(
      isIntervalInsideSelectableWindows('18:00', '22:00', result.windows),
    ).toBe(true);
  });
});

describe('enumerateWindowTimes', () => {
  it('start times exclude window end; end times include 24:00', () => {
    const evening = { start: '17:30', end: '24:00' };
    const starts = enumerateWindowTimes(evening, { forEndTime: false });
    expect(starts[0]).toBe('17:30');
    expect(starts).not.toContain('24:00');
  });
});

describe('subtractOccupiedFromWindows', () => {
  it('removes an existing evening entry from selectable evening window', () => {
    const base = computeSelectableOvertimeWindows(FULL);
    const remaining = subtractOccupiedFromWindows(base.windows, [
      { start: '18:00', end: '20:00' },
    ]);
    expect(remaining).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '18:00' },
      { start: '20:00', end: '24:00' },
    ]);
  });
});

describe('entryToSameDayOccupiedWindow / timeIntervalsOverlap', () => {
  it('maps ends-at-end-of-day to 24:00', () => {
    expect(
      entryToSameDayOccupiedWindow({
        startHhMm: '22:00',
        endHhMm: '00:00',
        endsAtEndOfDay: true,
      }),
    ).toEqual({ start: '22:00', end: '24:00' });
  });
});
