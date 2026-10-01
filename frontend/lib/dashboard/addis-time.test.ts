import { describe, expect, it } from 'vitest';
import { addisParts, daysUntil, greetingPeriod } from '@/lib/dashboard/addis-time';

describe('addis time', () => {
  it('shifts UTC by three hours, across the day and month boundary', () => {
    expect(addisParts(new Date('2026-09-30T22:30:00Z'))).toEqual({
      hour: 1,
      month: 10,
      year: 2026,
    });
    expect(addisParts(new Date('2026-10-01T08:00:00Z')).hour).toBe(11);
  });

  it('picks the greeting from the Addis hour', () => {
    expect(greetingPeriod(addisParts(new Date('2026-10-01T08:59:00Z')).hour)).toBe('morning');
    expect(greetingPeriod(addisParts(new Date('2026-10-01T09:00:00Z')).hour)).toBe('afternoon');
    expect(greetingPeriod(addisParts(new Date('2026-10-01T14:00:00Z')).hour)).toBe('evening');
  });

  it('counts calendar days in Addis time', () => {
    const now = new Date('2026-10-01T20:00:00Z'); // 23:00 in Addis
    expect(daysUntil('2026-10-02T00:00:00Z', now)).toBe(1);
    expect(daysUntil('2026-10-01T00:00:00Z', now)).toBe(0);
    expect(daysUntil('2026-09-28T12:00:00Z', now)).toBe(-3);
  });
});
