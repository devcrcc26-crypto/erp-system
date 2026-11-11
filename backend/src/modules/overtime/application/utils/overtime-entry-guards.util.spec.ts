import { describe, expect, it } from '@jest/globals';
import {
  ATTENDANCE_NO_SCANS_MESSAGE,
  buildAttendanceWarning,
  buildFullDayLeaveExcludedWindows,
  buildLeaveExcludedWindows,
  collectLeaveExcludedWindows,
  isWeekdayEatDateOnly,
  overlapsWeekdayLunchBreak,
  PAYROLL_LOCKED_MESSAGE,
  WEEKDAY_LUNCH_OT_MESSAGE,
} from './overtime-entry-guards.util';

const WEEKDAY = {
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};

describe('overtime-entry-guards.util', () => {
  it('exports payroll lock message constant', () => {
    expect(PAYROLL_LOCKED_MESSAGE).toContain(
      'locked in the current payroll run',
    );
  });

  it('morning leave → morning excluded window from schedule', () => {
    expect(buildLeaveExcludedWindows('MORNING', WEEKDAY)).toEqual({
      start: '08:30',
      end: '12:30',
    });
  });

  it('full-day leave excludes duty hours only (morning start → afternoon end)', () => {
    expect(buildFullDayLeaveExcludedWindows(WEEKDAY)).toEqual([
      { start: '08:30', end: '17:30' },
    ]);
    expect(collectLeaveExcludedWindows([{ dayPortion: 'FULL' }], WEEKDAY)).toEqual([
      { start: '08:30', end: '17:30' },
    ]);
  });

  it('full-day leave on day-off schedule excludes nothing', () => {
    expect(
      buildFullDayLeaveExcludedWindows({
        morningStart: null,
        morningEnd: null,
        afternoonStart: null,
        afternoonEnd: null,
      }),
    ).toEqual([]);
  });

  describe('buildAttendanceWarning', () => {
    it('no log → no scans warning', () => {
      expect(
        buildAttendanceWarning(null, {
          startTime: '18:00',
          endTime: '19:00',
          isOvernight: false,
        }),
      ).toBe(ATTENDANCE_NO_SCANS_MESSAGE);
    });

    it('empty scans → no scans warning', () => {
      expect(
        buildAttendanceWarning(
          {
            clockInLocal: null,
            clockOutLocal: null,
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
          },
          { startTime: '18:00', endTime: '19:00', isOvernight: false },
        ),
      ).toBe(ATTENDANCE_NO_SCANS_MESSAGE);
    });

    it('clock-out 17:32 vs claim end 19:00 → warning with 17:32', () => {
      expect(
        buildAttendanceWarning(
          {
            clockInLocal: '08:30',
            clockOutLocal: '17:32',
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
          },
          { startTime: '18:00', endTime: '19:00', isOvernight: false },
        ),
      ).toBe('Attendance shows clock-out at 17:32.');
    });

    it('clock-out 19:00 vs claim end 19:00 → no warning', () => {
      expect(
        buildAttendanceWarning(
          {
            clockInLocal: '08:30',
            clockOutLocal: '19:00',
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
          },
          { startTime: '18:00', endTime: '19:00', isOvernight: false },
        ),
      ).toBeNull();
    });
  });

  describe('overlapsWeekdayLunchBreak', () => {
    const monday = new Date(Date.UTC(2026, 9, 26)); // Mon 2026-10-26
    const saturday = new Date(Date.UTC(2026, 9, 31)); // Sat
    const sunday = new Date(Date.UTC(2026, 10, 1)); // Sun

    it('exports lunch rejection message', () => {
      expect(WEEKDAY_LUNCH_OT_MESSAGE).toContain('lunch break');
    });

    it('Mon–Fri are weekdays; Sat/Sun are not', () => {
      expect(isWeekdayEatDateOnly(monday)).toBe(true);
      expect(isWeekdayEatDateOnly(saturday)).toBe(false);
      expect(isWeekdayEatDateOnly(sunday)).toBe(false);
    });

    it('rejects interval that spans lunch on a weekday', () => {
      expect(overlapsWeekdayLunchBreak('07:00', '14:00', monday)).toBe(true);
      expect(overlapsWeekdayLunchBreak('12:00', '13:00', monday)).toBe(true);
      expect(overlapsWeekdayLunchBreak('12:30', '13:30', monday)).toBe(true);
      expect(overlapsWeekdayLunchBreak('13:00', '18:00', monday)).toBe(true);
    });

    it('allows intervals that only touch lunch boundaries', () => {
      expect(overlapsWeekdayLunchBreak('07:00', '12:30', monday)).toBe(false);
      expect(overlapsWeekdayLunchBreak('13:30', '18:00', monday)).toBe(false);
      expect(overlapsWeekdayLunchBreak('18:00', '22:00', monday)).toBe(false);
    });

    it('does not apply on Saturday or Sunday', () => {
      expect(overlapsWeekdayLunchBreak('12:00', '14:00', saturday)).toBe(false);
      expect(overlapsWeekdayLunchBreak('12:00', '14:00', sunday)).toBe(false);
    });

    it('skip option bypasses the check (site / holiday)', () => {
      expect(
        overlapsWeekdayLunchBreak('12:00', '14:00', monday, { skip: true }),
      ).toBe(false);
    });
  });
});
