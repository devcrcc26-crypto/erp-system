import { describe, expect, it } from '@jest/globals';
import { enrolmentGraceDateKeys } from './enrolment-grace.util';

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

describe('enrolmentGraceDateKeys', () => {
  const noHoliday = (): boolean => false;

  it('hire Mon, first scan Thu → grace Mon–Fri (through day after scan)', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 17),
      firstScanDate: d(2026, 8, 20),
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
    });
    expect([...keys].sort()).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ]);
  });

  it('no first scan yet → grace from hire through month end (working days)', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 17),
      firstScanDate: null,
      throughDate: d(2026, 8, 21),
      isPublicHoliday: noHoliday,
    });
    expect([...keys].sort()).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ]);
  });

  it('first scan on hire day → grace hire day and day after only', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 17),
      firstScanDate: d(2026, 8, 17),
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
    });
    expect([...keys].sort()).toEqual(['2026-08-17', '2026-08-18']);
  });

  it('skips Sunday within the grace window', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 14),
      firstScanDate: d(2026, 8, 18),
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
    });
    expect(keys.has('2026-08-16')).toBe(false);
    expect(keys.has('2026-08-14')).toBe(true);
    expect(keys.has('2026-08-19')).toBe(true);
  });

  it('Sat-off schedule skips Saturday in the grace window', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 14),
      firstScanDate: d(2026, 8, 18),
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
      isDayOff: (date) => {
        const dow = date.getUTCDay();
        return dow === 0 || dow === 6;
      },
    });
    expect(keys.has('2026-08-15')).toBe(false); // Saturday
    expect(keys.has('2026-08-16')).toBe(false); // Sunday
    expect(keys.has('2026-08-14')).toBe(true); // Friday
    expect(keys.has('2026-08-17')).toBe(true); // Monday
  });
});
