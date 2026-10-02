import { describe, expect, it } from '@jest/globals';
import {
  computeLeaveCoveredAbsences,
  dateToYyyyMmDd,
  getLeaveCoveredAbsencesForEmployees,
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
  statusApproved = true,
): LeaveCoverageLeave | null {
  if (!statusApproved) {
    return null;
  }
  return {
    id,
    leaveType: 'ANNUAL',
    periods: [{ startDate: utcDate(start), endDate: utcDate(end), days: 1 }],
  };
}

describe('dateToYyyyMmDd', () => {
  it('uses UTC calendar date for @db.Date values', () => {
    expect(dateToYyyyMmDd(utcDate('2026-10-02'))).toBe('2026-10-02');
  });
});

describe('computeLeaveCoveredAbsences', () => {
  const month = 10;
  const year = 2026;

  it('covers one absent working day when approved leave includes that date', () => {
    const approved = [leave('l1', '2026-10-06', '2026-10-06')!];
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
    const approved = [leave('l1', '2026-10-07', '2026-10-07')!];
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
    const approved = [leave('l1', '2026-10-03', '2026-10-05')!];
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
    const approved = [leave('l1', '2026-10-01', '2026-10-01')!];
    const result = computeLeaveCoveredAbsences(
      [log('2026-10-01', { isHoliday: true })],
      approved,
      month,
      year,
    );
    expect(result.coveredDays).toBe(0);
  });

  it('ignores non-approved leave when not passed into the calculation', () => {
    const draft = leave('l1', '2026-10-07', '2026-10-07', false);
    expect(draft).toBeNull();
    const result = computeLeaveCoveredAbsences(
      [log('2026-10-07')],
      [],
      month,
      year,
    );
    expect(result.coveredDays).toBe(0);
  });

  it('produces the same adjusted absent math for payroll and attendance views', () => {
    const absentDays = 3;
    const approved = [leave('l1', '2026-10-06', '2026-10-07')!];
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
                },
              ],
            },
          ];
        },
      },
      leaveRequest: {
        findMany: async () => {
          queryCount += 1;
          return [];
        },
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
