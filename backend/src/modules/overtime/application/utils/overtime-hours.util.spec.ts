import { describe, expect, it } from '@jest/globals';
import {
  buildOvertimeScheduleNote,
  calculateOvertimeHours,
  totalOvertimeHours,
  type OvertimeDayContext,
} from './overtime-hours.util';

/** CRCC Standard schedule contexts (fixed for matrix tests). */
const WD: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};

const HALF: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: true,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: null,
  afternoonEnd: null,
};

const OFF: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: false,
  isHalfDay: false,
  morningStart: null,
  morningEnd: null,
  afternoonStart: null,
  afternoonEnd: null,
};

const HOLIDAY: OvertimeDayContext = {
  isHoliday: true,
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function expectBuckets(
  result: ReturnType<typeof calculateOvertimeHours>,
  expected: {
    regularHours?: number;
    nightHours?: number;
    weekendHours?: number;
    holidayHours?: number;
  },
): void {
  expect(result.regularHours).toBe(expected.regularHours ?? 0);
  expect(result.nightHours).toBe(expected.nightHours ?? 0);
  expect(result.weekendHours).toBe(expected.weekendHours ?? 0);
  expect(result.holidayHours).toBe(expected.holidayHours ?? 0);
}

describe('calculateOvertimeHours - CRCC classification matrix', () => {
  it('1 - Mon 18:00–21:00 weekday → 3 h Regular', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '18:00', '21:00', WD),
      { regularHours: 3 },
    );
  });

  it('2 - Mon 18:00–23:00 weekday → 4 h Regular + 1 h Night', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '18:00', '23:00', WD),
      { regularHours: 4, nightHours: 1 },
    );
  });

  it('3 - Mon 22:00–02:00 overnight (WD / WD) → 4 h Night', () => {
    expectBuckets(
      calculateOvertimeHours(
        utcDate('2026-09-14'),
        '22:00',
        '02:00',
        WD,
        true,
        WD,
      ),
      { nightHours: 4 },
    );
  });

  it('4 - Mon 09:00–17:00 weekday → 0 h (schedule + lunch excluded)', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '09:00', '17:00', WD),
      {},
    );
  });

  it('5 - Mon 17:00–19:00 weekday → 1.5 h Regular', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '17:00', '19:00', WD),
      { regularHours: 1.5 },
    );
  });

  it('6 - Mon 12:30–13:30 lunch gap → 0 h (lunch not OT)', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '12:30', '13:30', WD),
      {},
    );
  });

  it('7 - Sat 09:00–12:00 half day (inside morning) → 0 h', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '09:00', '12:00', HALF),
      {},
    );
    expect(
      totalOvertimeHours(
        calculateOvertimeHours(utcDate('2026-09-12'), '09:00', '12:00', HALF),
      ),
    ).toBe(0);
  });

  it('8 - Sat 13:00–17:00 half day afternoon → 4 h Weekend', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '13:00', '17:00', HALF),
      { weekendHours: 4 },
    );
  });

  it('9 - Sun 08:00–12:00 off day → 4 h Weekend', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-13'), '08:00', '12:00', OFF),
      { weekendHours: 4 },
    );
  });

  it('9b - Sat-off employee Saturday OT → all Weekend (not half-day rules)', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '08:00', '17:00', OFF),
      { weekendHours: 9 },
    );
  });

  it('10 - Sat 20:00 – Sun 02:00 half then off overnight → 4 W + 2 W', () => {
    expectBuckets(
      calculateOvertimeHours(
        utcDate('2026-09-12'),
        '20:00',
        '02:00',
        HALF,
        true,
        OFF,
      ),
      { weekendHours: 6 },
    );
  });

  it('11 - Fri 20:00 – Sat 02:00 WD then half overnight → 2 R + 4 N', () => {
    expectBuckets(
      calculateOvertimeHours(
        utcDate('2026-09-11'),
        '20:00',
        '02:00',
        WD,
        true,
        HALF,
      ),
      { regularHours: 2, nightHours: 4 },
    );
  });

  it('12 - Public holiday 09:00–13:00 → 4 h Holiday', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-11'), '09:00', '13:00', HOLIDAY),
      { holidayHours: 4 },
    );
  });

  it('13 - Sep 10 20:00 – Sep 11 02:00 WD then holiday → 2 R + 2 N + 2 H', () => {
    expectBuckets(
      calculateOvertimeHours(
        utcDate('2026-09-10'),
        '20:00',
        '02:00',
        WD,
        true,
        HOLIDAY,
      ),
      { regularHours: 2, nightHours: 2, holidayHours: 2 },
    );
  });

  it('14 - WFH treated as working day 18:00–20:00 → 2 h Regular', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-08-14'), '18:00', '20:00', WD),
      { regularHours: 2 },
    );
  });

  it('16 - Mon 18:07–19:52 → 1.75 h Regular', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '18:07', '19:52', WD),
      { regularHours: 1.75 },
    );
  });

  it('minute-precise - 23:00–23:10 → 0.17 h Night', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '23:00', '23:10', WD),
      { nightHours: 0.17 },
    );
  });

  it('minute-precise - 17:30–19:20 → 1.83 h Regular', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '17:30', '19:20', WD),
      { regularHours: 1.83 },
    );
  });

  it('Sat 00:00–06:00 → 6 h Night (pre-morning weekday rules)', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '00:00', '06:00', HALF),
      { nightHours: 6 },
    );
  });

  it('Sat 06:00–08:00 → 2 h Regular', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '06:00', '08:00', HALF),
      { regularHours: 2 },
    );
  });

  it('Sat 13:00–15:00 → 2 h Weekend', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '13:00', '15:00', HALF),
      { weekendHours: 2 },
    );
  });

  it('Sat 22:00–24:00 → 2 h Weekend (weekend over night after morning)', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '22:00', '24:00', HALF),
      { weekendHours: 2 },
    );
  });

  it('entry entirely inside schedule (09:00–12:00 weekday) → all zeros', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-14'), '09:00', '12:00', WD),
      {},
    );
  });

  it('rejects end at or before start unless overnight', () => {
    expect(() =>
      calculateOvertimeHours(utcDate('2026-09-14'), '09:00', '08:00', WD),
    ).toThrow('after start time on the same calendar day');
  });

  it('Fri 22:00–24:00 → 2 h Night', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-11'), '22:00', '24:00', WD),
      { nightHours: 2 },
    );
  });

  it('Sat 00:00–02:00 → 2 h Night (half-day pre-morning night)', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '00:00', '02:00', HALF),
      { nightHours: 2 },
    );
  });

  it('Sat 23:00–24:00 → 1 h Weekend', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-12'), '23:00', '24:00', HALF),
      { weekendHours: 1 },
    );
  });

  it('Sun 00:00–01:00 → 1 h Weekend', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-13'), '00:00', '01:00', OFF),
      { weekendHours: 1 },
    );
  });

  it('holiday 00:00–01:00 → 1 h Holiday', () => {
    expectBuckets(
      calculateOvertimeHours(utcDate('2026-09-11'), '00:00', '01:00', HOLIDAY),
      { holidayHours: 1 },
    );
  });

  it('overnight without nextDayContext throws', () => {
    expect(() =>
      calculateOvertimeHours(
        utcDate('2026-09-14'),
        '22:00',
        '02:00',
        WD,
        true,
      ),
    ).toThrow('next calendar day schedule context');
  });
});

describe('totalOvertimeHours', () => {
  it('sums all buckets', () => {
    expect(
      totalOvertimeHours({
        regularHours: 2,
        nightHours: 1,
        weekendHours: 0.5,
        holidayHours: 0,
      }),
    ).toBe(3.5);
  });
});

describe('buildOvertimeScheduleNote', () => {
  it('describes a Saturday half day', () => {
    expect(buildOvertimeScheduleNote(utcDate('2026-09-12'), HALF)).toBe(
      'Saturday half day - after morning ends classified as weekend; before morning uses night/regular rules',
    );
  });

  it('describes a Sunday off day', () => {
    expect(buildOvertimeScheduleNote(utcDate('2026-09-13'), OFF)).toBe(
      'Sunday is a non-working day - hours classified as weekend',
    );
  });

  it('returns null on a holiday or full working day', () => {
    expect(
      buildOvertimeScheduleNote(utcDate('2026-09-14'), {
        ...WD,
        isHoliday: true,
      }),
    ).toBeNull();
    expect(buildOvertimeScheduleNote(utcDate('2026-09-14'), WD)).toBeNull();
  });
});
