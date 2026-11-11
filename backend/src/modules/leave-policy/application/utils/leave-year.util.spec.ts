import {
  anniversaryInYear,
  buildLeaveCalendar,
  isLeaveYearStart,
  leaveCalendarOrigin,
  leaveYearByLabel,
  leaveYearFor,
  splitRangeByLeaveYears,
  toDateOnlyKey,
  toDateOnlyUtc,
} from './leave-year.util';

function d(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

describe('leave-year.util (Addis date-only)', () => {
  const employment = d('2023-10-10');

  it('maps a date before the 2026 anniversary to leave year 2025', () => {
    const year = leaveYearFor(employment, d('2026-10-05'));
    expect(year.label).toBe(2025);
    expect(toDateOnlyKey(year.start)).toBe('2025-10-10');
    expect(toDateOnlyKey(year.end)).toBe('2026-10-09');
  });

  it('puts the anniversary day itself in the new leave year', () => {
    const year = leaveYearFor(employment, d('2026-10-10'));
    expect(year.label).toBe(2026);
    expect(toDateOnlyKey(year.start)).toBe('2026-10-10');
  });

  it('normalizes timestamptz near midnight via Africa/Addis_Ababa', () => {
    // 2026-10-09 21:00 UTC = 2026-10-10 00:00 Addis → civil 2026-10-10
    const nearMidnight = new Date('2026-10-09T21:00:00.000Z');
    expect(toDateOnlyKey(nearMidnight)).toBe('2026-10-10');
    const year = leaveYearFor(employment, nearMidnight);
    expect(year.label).toBe(2026);
  });

  it('splits a range that crosses the anniversary into two leave years', () => {
    const segments = splitRangeByLeaveYears(
      employment,
      d('2026-10-08'),
      d('2026-10-12'),
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]!.year.label).toBe(2025);
    expect(toDateOnlyKey(segments[0]!.start)).toBe('2026-10-08');
    expect(toDateOnlyKey(segments[0]!.end)).toBe('2026-10-09');
    expect(segments[1]!.year.label).toBe(2026);
    expect(toDateOnlyKey(segments[1]!.start)).toBe('2026-10-10');
    expect(toDateOnlyKey(segments[1]!.end)).toBe('2026-10-12');
  });

  it('keeps anniversaryInYear on the civil hire month/day', () => {
    expect(toDateOnlyKey(anniversaryInYear(employment, 2026))).toBe(
      '2026-10-10',
    );
  });

  it('toDateOnlyUtc stores UTC midnight of the Addis civil date', () => {
    const value = toDateOnlyUtc(new Date('2026-10-09T21:00:00.000Z'));
    expect(value.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });
});

describe('leave-year.util (contract calendar)', () => {
  const key = (year: { label: number; start: Date; end: Date }) =>
    `${year.label} ${toDateOnlyKey(year.start)}..${toDateOnlyKey(year.end)}`;

  it('each contract restarts the cycle; the last year of a contract ends before the next', () => {
    const cal = buildLeaveCalendar([d('2024-03-01'), d('2025-12-01')], d('2020-08-01'));
    expect(key(leaveYearFor(cal, d('2024-06-01')))).toBe('2024 2024-03-01..2025-02-28');
    expect(key(leaveYearFor(cal, d('2025-11-30')))).toBe('2025 2025-03-01..2025-11-30');
    // Second leave year starting in 2025 takes the next label.
    expect(key(leaveYearFor(cal, d('2025-12-01')))).toBe('2026 2025-12-01..2026-11-30');
    expect(key(leaveYearFor(cal, d('2027-01-15')))).toBe('2027 2026-12-01..2027-11-30');
  });

  it('labels round-trip through leaveYearByLabel', () => {
    const cal = buildLeaveCalendar([d('2024-03-01'), d('2025-12-01')], null);
    for (const label of [2022, 2023, 2024, 2025, 2026, 2027, 2030]) {
      const year = leaveYearByLabel(cal, label);
      expect(year.label).toBe(label);
      expect(leaveYearFor(cal, year.start).label).toBe(label);
      expect(leaveYearFor(cal, year.end).label).toBe(label);
    }
  });

  it('before the first contract, years follow its anniversaries backwards', () => {
    const cal = buildLeaveCalendar([d('2024-03-01')], d('2020-08-01'));
    expect(key(leaveYearFor(cal, d('2023-09-01')))).toBe('2023 2023-03-01..2024-02-29');
  });

  it('without contracts, falls back to employment anniversaries / calendar years', () => {
    expect(key(leaveYearFor(buildLeaveCalendar([], d('2020-08-01')), d('2026-01-05')))).toBe(
      '2025 2025-08-01..2026-07-31',
    );
    expect(key(leaveYearFor(buildLeaveCalendar([], null), d('2026-01-05')))).toBe(
      '2026 2026-01-01..2026-12-31',
    );
  });

  it('a leave year starts on contract starts and contract anniversaries only', () => {
    const cal = buildLeaveCalendar([d('2025-03-01'), d('2026-09-15')], d('2020-08-01'));
    expect(isLeaveYearStart(cal, d('2025-03-01'))).toBe(true);
    expect(isLeaveYearStart(cal, d('2026-03-01'))).toBe(true);
    expect(isLeaveYearStart(cal, d('2026-09-15'))).toBe(true);
    expect(isLeaveYearStart(cal, d('2027-09-15'))).toBe(true);
    expect(isLeaveYearStart(cal, d('2027-03-01'))).toBe(false);
    expect(isLeaveYearStart(cal, d('2025-08-01'))).toBe(false);
  });

  it('splits a leave range at the contract boundary', () => {
    const cal = buildLeaveCalendar([d('2025-03-01'), d('2025-12-01')], null);
    const segments = splitRangeByLeaveYears(cal, d('2025-11-28'), d('2025-12-03'));
    expect(segments.map((s) => s.year.label)).toEqual([2025, 2026]);
    expect(toDateOnlyKey(segments[0]!.end)).toBe('2025-11-30');
  });

  it('origin is the earlier of employment date and first contract start', () => {
    expect(leaveCalendarOrigin(buildLeaveCalendar([d('2024-03-01')], d('2020-08-01')))).toEqual(
      d('2020-08-01'),
    );
    expect(leaveCalendarOrigin(buildLeaveCalendar([d('2024-03-01')], null))).toEqual(d('2024-03-01'));
  });
});
