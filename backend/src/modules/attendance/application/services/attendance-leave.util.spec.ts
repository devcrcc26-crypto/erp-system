import { describe, expect, it } from '@jest/globals';
import {
  combinedLeaveWeightForDate,
  computeLeaveCoveredAbsences,
  dateToYyyyMmDd,
  getLeaveCoveredAbsencesForEmployees,
  leavePortionWeight,
  netAbsenceAfterLeave,
  type LeaveCoverageDailyLog,
  type LeaveCoverageLeave,
} from './attendance-leave.util';

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function log(
  date: string,
  overrides: Partial<LeaveCoverageDailyLog> = {},
): LeaveCoverageDailyLog {
  return {
    date: utcDate(date),
    isHoliday: false,
    isWeekend: false,
    wasPresent: false,
    ...overrides,
  };
}

function leave(
  id: string,
  start: string,
  end: string,
  dayPortion: 'FULL' | 'MORNING' | 'AFTERNOON' = 'FULL',
): LeaveCoverageLeave {
  return {
    id,
    leaveType: 'ANNUAL',
    periods: [
      {
        startDate: utcDate(start),
        endDate: utcDate(end),
        days: dayPortion === 'FULL' ? 1 : 0.5,
        dayPortion,
      },
    ],
  };
}

describe('dateToYyyyMmDd', () => {
  it('uses UTC calendar date for @db.Date values', () => {
    expect(dateToYyyyMmDd(utcDate('2026-10-02'))).toBe('2026-10-02');
  });
});

describe('leavePortionWeight', () => {
  it('FULL = 1, MORNING/AFTERNOON = 0.5', () => {
    expect(leavePortionWeight('FULL')).toBe(1);
    expect(leavePortionWeight('MORNING')).toBe(0.5);
    expect(leavePortionWeight('AFTERNOON')).toBe(0.5);
  });
});

describe('computeLeaveCoveredAbsences - portion-aware payroll restore', () => {
  const month = 10;
  const year = 2026;
  const day = '2026-10-06'; // Tuesday

  it('Absent all day + morning leave → deduction 0.5', () => {
    const result = computeLeaveCoveredAbsences(
      [log(day)],
      [leave('l1', day, day, 'MORNING')],
      month,
      year,
    );
    expect(result.coveredDays).toBe(0.5);
    expect(netAbsenceAfterLeave(1, result.coveredDays)).toBe(0.5);
  });

  it('Attended afternoon (absence 0.5) + morning leave → deduction 0', () => {
    const result = computeLeaveCoveredAbsences(
      [log(day, { wasPresent: true, payrollAbsenceWeight: 0.5 })],
      [leave('l1', day, day, 'MORNING')],
      month,
      year,
    );
    expect(result.coveredDays).toBe(0.5);
    expect(netAbsenceAfterLeave(0.5, result.coveredDays)).toBe(0);
  });

  it('Absent Saturday + full-day leave → deduction 0', () => {
    const sat = '2026-10-10';
    const result = computeLeaveCoveredAbsences(
      [log(sat, { isHalfDay: true })],
      [leave('l1', sat, sat, 'FULL')],
      month,
      year,
    );
    expect(result.coveredDays).toBe(1);
    expect(netAbsenceAfterLeave(1, result.coveredDays)).toBe(0);
  });

  it('Absent weekday + full-day leave → deduction 0', () => {
    const result = computeLeaveCoveredAbsences(
      [log(day)],
      [leave('l1', day, day, 'FULL')],
      month,
      year,
    );
    expect(result.coveredDays).toBe(1);
    expect(netAbsenceAfterLeave(1, result.coveredDays)).toBe(0);
  });

  it('Morning and afternoon leaves on the same day, absent all day → deduction 0', () => {
    const result = computeLeaveCoveredAbsences(
      [log(day)],
      [
        leave('am', day, day, 'MORNING'),
        leave('pm', day, day, 'AFTERNOON'),
      ],
      month,
      year,
    );
    expect(combinedLeaveWeightForDate(day, [
      leave('am', day, day, 'MORNING'),
      leave('pm', day, day, 'AFTERNOON'),
    ])).toBe(1);
    expect(result.coveredDays).toBe(1);
    expect(netAbsenceAfterLeave(1, result.coveredDays)).toBe(0);
  });
});

describe('computeLeaveCoveredAbsences - legacy full-day behaviour', () => {
  const month = 10;
  const year = 2026;

  it('covers one absent working day when approved leave includes that date', () => {
    const approved = [leave('l1', '2026-10-06', '2026-10-06')];
    const result = computeLeaveCoveredAbsences(
      [log('2026-10-06')],
      approved,
      month,
      year,
    );
    expect(result.coveredDays).toBe(1);
    expect(result.coveredDates).toEqual(['2026-10-06']);
  });

  it('does not cover a present working day even when leave includes that date', () => {
    const approved = [leave('l1', '2026-10-07', '2026-10-07')];
    const result = computeLeaveCoveredAbsences(
      [log('2026-10-07', { wasPresent: true })],
      approved,
      month,
      year,
    );
    expect(result.coveredDays).toBe(0);
    expect(result.coveredDates).toEqual([]);
  });

  it('counts only working absent days in a Sat–Mon span (Sunday non-working)', () => {
    const approved = [leave('l1', '2026-10-03', '2026-10-05')];
    const result = computeLeaveCoveredAbsences(
      [
        log('2026-10-03', { isWeekend: true }),
        log('2026-10-04', { isWeekend: true }),
        log('2026-10-05'),
      ],
      approved,
      month,
      year,
    );
    expect(result.coveredDays).toBe(1);
    expect(result.coveredDates).toEqual(['2026-10-05']);
  });

  it('does not cover leave on a public holiday', () => {
    const approved = [leave('l1', '2026-10-01', '2026-10-01')];
    const result = computeLeaveCoveredAbsences(
      [log('2026-10-01', { isHoliday: true })],
      approved,
      month,
      year,
    );
    expect(result.coveredDays).toBe(0);
  });

  it('produces the same adjusted absent math for payroll and attendance views', () => {
    const absentDays = 3;
    const approved = [leave('l1', '2026-10-06', '2026-10-07')];
    const logs = [
      log('2026-10-06'),
      log('2026-10-07'),
      log('2026-10-08'),
    ];
    const payrollView = computeLeaveCoveredAbsences(logs, approved, month, year);
    const attendanceView = computeLeaveCoveredAbsences(logs, approved, month, year);
    const adjustedPayroll = Math.max(0, absentDays - payrollView.coveredDays);
    const adjustedAttendance = Math.max(
      0,
      absentDays - attendanceView.coveredDays,
    );
    expect(adjustedPayroll).toBe(adjustedAttendance);
    expect(adjustedPayroll).toBe(1);
  });
});

describe('getLeaveCoveredAbsencesForEmployees', () => {
  it('uses a fixed number of prisma queries regardless of employee count', async () => {
    let queryCount = 0;
    const prisma = {
      attendanceRecord: {
        findMany: async () => {
          queryCount += 1;
          return [
            {
              employeeId: 'e1',
              dailyLogs: [
                {
                  date: utcDate('2026-10-07'),
                  isHoliday: false,
                  isWeekend: false,
                  wasPresent: false,
                  isHalfDay: false,
                },
              ],
            },
            {
              employeeId: 'e2',
              dailyLogs: [
                {
                  date: utcDate('2026-10-08'),
                  isHoliday: false,
                  isWeekend: false,
                  wasPresent: false,
                  isHalfDay: false,
                },
              ],
            },
          ];
        },
      },
      $queryRawUnsafe: async () => {
        queryCount += 1;
        return [];
      },
    };

    await getLeaveCoveredAbsencesForEmployees(
      prisma as never,
      'company-1',
      ['e1', 'e2', 'e3'],
      10,
      2026,
    );

    expect(queryCount).toBe(2);
  });
});
