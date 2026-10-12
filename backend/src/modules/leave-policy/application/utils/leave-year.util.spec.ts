import {
  anniversaryInYear,
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
