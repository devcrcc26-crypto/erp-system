import {
  calendarDaysInclusive,
  getTodayInTimezone,
  isDateInFuture,
  isDateInPast,
  isInstantOnPastDay,
  parseLocalDateOnly,
  startOfToday,
} from '../date-validation.util';

describe('date-validation.util', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('company "today" (Africa/Addis_Ababa, UTC+3)', () => {
    it('is already the next day between 00:00 and 02:59 local time', () => {
      // 2026-09-16T22:30Z = 2026-09-17 01:30 in Addis Ababa
      jest.useFakeTimers().setSystemTime(new Date('2026-09-16T22:30:00Z'));

      expect(getTodayInTimezone()).toBe('2026-09-17');
      expect(isDateInFuture('2026-09-17')).toBe(false);
      expect(isDateInFuture('2026-09-18')).toBe(true);
      expect(isDateInPast('2026-09-16')).toBe(true);
      expect(startOfToday().toISOString()).toBe('2026-09-17T00:00:00.000Z');
    });

    it('treats an instant late on the previous local day as a past day', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-17T06:00:00Z'));

      // 2026-09-16T20:59Z = 23:59 on the 16th in Addis Ababa
      expect(isInstantOnPastDay(new Date('2026-09-16T20:59:00Z'))).toBe(true);
      // 2026-09-16T21:00Z = 00:00 on the 17th in Addis Ababa
      expect(isInstantOnPastDay(new Date('2026-09-16T21:00:00Z'))).toBe(false);
    });
  });

  describe('parseLocalDateOnly', () => {
    it('uses only the calendar date portion', () => {
      expect(parseLocalDateOnly('2026-09-30').toISOString()).toBe(
        '2026-09-30T00:00:00.000Z',
      );
      expect(parseLocalDateOnly('2026-09-30T23:00:00.000Z').toISOString()).toBe(
        '2026-09-30T00:00:00.000Z',
      );
    });

    it('rejects impossible dates', () => {
      expect(() => parseLocalDateOnly('2026-02-30')).toThrow();
      expect(() => parseLocalDateOnly('not-a-date')).toThrow();
    });
  });

  it('counts calendar days inclusively', () => {
    expect(
      calendarDaysInclusive(
        parseLocalDateOnly('2026-09-01'),
        parseLocalDateOnly('2026-09-30'),
      ),
    ).toBe(30);
    expect(
      calendarDaysInclusive(
        parseLocalDateOnly('2026-09-28'),
        parseLocalDateOnly('2026-09-28'),
      ),
    ).toBe(1);
  });
});
