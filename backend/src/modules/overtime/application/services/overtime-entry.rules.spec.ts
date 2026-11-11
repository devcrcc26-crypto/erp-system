import { describe, expect, it } from '@jest/globals';
import {
  buildLeaveExcludedWindows,
  collectLeaveExcludedWindows,
} from '../utils/overtime-entry-guards.util';

describe('overtime entry leave rules', () => {
  it('uses fallback morning window when schedule slice is missing', () => {
    expect(buildLeaveExcludedWindows('MORNING', undefined)).toEqual({
      start: '08:30',
      end: '12:30',
    });
  });

  it('uses fallback afternoon window when schedule slice is missing', () => {
    expect(buildLeaveExcludedWindows('AFTERNOON', undefined)).toEqual({
      start: '13:30',
      end: '17:30',
    });
  });

  it('merges multiple half-day leave windows', () => {
    const windows = collectLeaveExcludedWindows(
      [{ dayPortion: 'MORNING' }, { dayPortion: 'AFTERNOON' }],
      {
        morningStart: '09:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00',
      },
    );
    expect(windows).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '18:00' },
    ]);
  });

  it('full-day leave maps to continuous duty window', () => {
    expect(
      collectLeaveExcludedWindows([{ dayPortion: 'FULL' }], {
        morningStart: '09:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00',
      }),
    ).toEqual([{ start: '09:00', end: '18:00' }]);
  });
});
