import { describe, expect, it } from 'vitest';
import type { FlaggedDay } from '@/lib/api/attendance.types';
import { getValidBulkReasons, toDayEntry } from './FieldMovementForm';

function flagged(partial: Partial<FlaggedDay>): FlaggedDay {
  return {
    id: 'log-1',
    date: '2026-08-03',
    flag: 'MISSING_CLOCK_IN',
    clockInLocal: null,
    clockOutLocal: null,
    correctedClockInLocal: null,
    correctedClockOutLocal: null,
    isHalfDay: false,
    availableReasons: ['FIELD_VISIT', 'FORGOT_CLOCK_IN'],
    alreadySubmitted: false,
    submittedLog: null,
    ...partial,
  };
}

describe('"Forgot both" availability', () => {
  it('a day with neither scan allows it; a day with one scan does not', () => {
    expect(toDayEntry(flagged({})).bothScansMissing).toBe(true);
    expect(toDayEntry(flagged({ clockOutLocal: '17:31' })).bothScansMissing).toBe(false);
    expect(
      toDayEntry(flagged({ flag: 'MISSING_CLOCK_OUT', clockInLocal: '08:02' })).bothScansMissing,
    ).toBe(false);
    // A corrected time counts as recorded.
    expect(toDayEntry(flagged({ correctedClockInLocal: '08:00' })).bothScansMissing).toBe(false);
  });

  it('bulk offers it only when a selected day has both scans missing', () => {
    const oneScan = [
      toDayEntry(flagged({ id: 'a', clockOutLocal: '17:31' })),
      toDayEntry(flagged({ id: 'b', flag: 'MISSING_CLOCK_OUT', clockInLocal: '08:02' })),
    ];
    expect(getValidBulkReasons(oneScan)).not.toContain('FORGOT_BOTH');

    const withBothMissing = [...oneScan, toDayEntry(flagged({ id: 'c' }))];
    expect(getValidBulkReasons(withBothMissing)).toContain('FORGOT_BOTH');
  });

  it('starts with an empty stated clock-in', () => {
    expect(toDayEntry(flagged({})).clockInTime).toBe('');
  });
});
