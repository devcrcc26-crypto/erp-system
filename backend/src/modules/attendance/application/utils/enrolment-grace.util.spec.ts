import { describe, expect, it } from '@jest/globals';
import { enrolmentGraceDateKeys } from './enrolment-grace.util';

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

describe('enrolmentGraceDateKeys', () => {
  const noHoliday = (): boolean => false;

  it('hire Mon → first 3 working days before first scan', () => {
    // Mon 17 Aug 2026, first scan Thu 20 → grace Mon–Wed
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
    ]);
  });

  it('no first scan yet → still only 3 working days from hire', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 17),
      firstScanDate: null,
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
    });
    expect([...keys].sort()).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
    ]);
  });

  it('first scan on hire day → no grace days', () => {
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 17),
      firstScanDate: d(2026, 8, 17),
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
    });
    expect(keys.size).toBe(0);
  });

  it('skips Sunday when counting grace working days', () => {
    // Fri 14 Aug 2026 hire; Sun 16 skipped → Fri, Sat, Mon
    const keys = enrolmentGraceDateKeys({
      hireDate: d(2026, 8, 14),
      firstScanDate: null,
      throughDate: d(2026, 8, 31),
      isPublicHoliday: noHoliday,
    });
    expect([...keys].sort()).toEqual([
      '2026-08-14',
      '2026-08-15',
      '2026-08-17',
    ]);
  });
});
