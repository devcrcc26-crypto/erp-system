import {
  summarizeAttendanceDays,
  workingDayWeight,
} from './attendance-absence.util';

describe('attendance-absence.util', () => {
  describe('workingDayWeight', () => {
    it('half-day = 0.5, full day = 1', () => {
      expect(workingDayWeight(true)).toBe(0.5);
      expect(workingDayWeight(false)).toBe(1);
    });
  });

  describe('summarizeAttendanceDays', () => {
    it('scheduled − present with half-day weights', () => {
      const summary = summarizeAttendanceDays([
        {
          isHoliday: false,
          isWeekend: false,
          wasPresent: true,
          isHalfDay: false,
        },
        {
          isHoliday: false,
          isWeekend: false,
          wasPresent: false,
          isHalfDay: true,
        },
        {
          isHoliday: false,
          isWeekend: false,
          wasPresent: true,
          isHalfDay: true,
        },
      ]);
      expect(summary.scheduledDays).toBe(2);
      expect(summary.presentDays).toBe(1.5);
      expect(summary.absentDays).toBe(0.5);
    });
  });
});
