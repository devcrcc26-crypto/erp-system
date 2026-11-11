import { summarizeAttendanceDays } from './attendance-absence.util';

describe('attendance-absence.util', () => {
  describe('summarizeAttendanceDays', () => {
    it('every working day counts 1 - half-day (Saturday) schedules are never 0.5', () => {
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
      expect(summary.scheduledDays).toBe(3);
      expect(summary.presentDays).toBe(2);
      expect(summary.absentDays).toBe(1);
    });
  });
});
