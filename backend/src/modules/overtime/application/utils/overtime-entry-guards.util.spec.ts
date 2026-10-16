import { describe, expect, it } from '@jest/globals';
import {
  ATTENDANCE_NO_SCANS_MESSAGE,
  buildAttendanceWarning,
  buildFullDayLeaveExcludedWindows,
  buildLeaveExcludedWindows,
  collectLeaveExcludedWindows,
  PAYROLL_LOCKED_MESSAGE,
} from './overtime-entry-guards.util';

const WEEKDAY = {
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};

describe('overtime-entry-guards.util', () => {
  it('exports payroll lock message constant', () => {
    expect(PAYROLL_LOCKED_MESSAGE).toContain('payroll run is finalized');
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
});
