import {
  countAbsentDaysInWindows,
  summarizeAttendanceDays,
  workingDayWeight,
} from './attendance-absence.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('attendance-absence.util', () => {
  describe('workingDayWeight', () => {
    it('half-day = 0.5, full day = 1', () => {
      expect(workingDayWeight(true)).toBe(0.5);
      expect(workingDayWeight(false)).toBe(1);
    });
  });

  describe('countAbsentDaysInWindows', () => {
    const fullMonthWindow = [
      {
        windowStart: d(2026, 8, 1),
        windowEnd: d(2026, 8, 31),
      },
    ];

    it('missed half-day Saturday = 0.5', () => {
      const result = countAbsentDaysInWindows(
        [
          {
            date: d(2026, 8, 1), // Saturday
            isHoliday: false,
            isWeekend: false,
            wasPresent: false,
            isHalfDay: true,
          },
        ],
        fullMonthWindow,
      );
      expect(result.absentDays).toBe(0.5);
      expect(result.absentDates).toEqual(['2026-08-01']);
    });

    it('missed full weekday = 1', () => {
      const result = countAbsentDaysInWindows(
        [
          {
            date: d(2026, 8, 3), // Monday
            isHoliday: false,
            isWeekend: false,
            wasPresent: false,
            isHalfDay: false,
          },
        ],
        fullMonthWindow,
      );
      expect(result.absentDays).toBe(1);
    });

    it('ignores weekends, holidays, present days, and out-of-window absences', () => {
      const result = countAbsentDaysInWindows(
        [
          {
            date: d(2026, 8, 2),
            isHoliday: false,
            isWeekend: true,
            wasPresent: false,
            isHalfDay: false,
          },
          {
            date: d(2026, 8, 4),
            isHoliday: true,
            isWeekend: false,
            wasPresent: false,
            isHalfDay: false,
          },
          {
            date: d(2026, 8, 5),
            isHoliday: false,
            isWeekend: false,
            wasPresent: true,
            isHalfDay: false,
          },
          {
            date: d(2026, 7, 31),
            isHoliday: false,
            isWeekend: false,
            wasPresent: false,
            isHalfDay: false,
          },
        ],
        fullMonthWindow,
      );
      expect(result.absentDays).toBe(0);
    });

    it('full-month employee absent count equals monthly absentDays fixture', () => {
      // Fixture: 3 full weekday absences + 1 half-day Saturday = 3.5
      const logs = [
        {
          date: d(2026, 8, 1),
          isHoliday: false,
          isWeekend: false,
          wasPresent: false,
          isHalfDay: true,
        },
        {
          date: d(2026, 8, 3),
          isHoliday: false,
          isWeekend: false,
          wasPresent: false,
          isHalfDay: false,
        },
        {
          date: d(2026, 8, 4),
          isHoliday: false,
          isWeekend: false,
          wasPresent: false,
          isHalfDay: false,
        },
        {
          date: d(2026, 8, 5),
          isHoliday: false,
          isWeekend: false,
          wasPresent: false,
          isHalfDay: false,
        },
        {
          date: d(2026, 8, 6),
          isHoliday: false,
          isWeekend: false,
          wasPresent: true,
          isHalfDay: false,
        },
      ];

      const monthly = summarizeAttendanceDays(logs);
      expect(monthly.absentDays).toBe(3.5);

      const inWindow = countAbsentDaysInWindows(logs, fullMonthWindow);
      expect(inWindow.absentDays).toBe(monthly.absentDays);
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
