import { describe, expect, it } from 'vitest';
import type { FlaggedDay } from '@/lib/api/attendance.types';
import {
  getValidBulkForgotDirections,
  getValidBulkReasons,
  toDayEntry,
} from './field-movement-form-model';

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
    expect(toDayEntry(flagged({ clockOutLocal: '17:31' })).bothScansMissing).toBe(
      false,
    );
    expect(
      toDayEntry(flagged({ flag: 'MISSING_CLOCK_OUT', clockInLocal: '08:02' }))
        .bothScansMissing,
    ).toBe(false);
    expect(toDayEntry(flagged({ correctedClockInLocal: '08:00' })).bothScansMissing).toBe(
      false,
    );
  });

  it('bulk offers BOTH only when a selected day has both scans missing', () => {
    const oneScan = [
      toDayEntry(flagged({ id: 'a', clockOutLocal: '17:31' })),
      toDayEntry(
        flagged({ id: 'b', flag: 'MISSING_CLOCK_OUT', clockInLocal: '08:02' }),
      ),
    ];
    expect(getValidBulkForgotDirections(oneScan)).not.toContain('BOTH');

    const withBothMissing = [...oneScan, toDayEntry(flagged({ id: 'c' }))];
    expect(getValidBulkForgotDirections(withBothMissing)).toContain('BOTH');
  });

  it('bulk reason types include FORGOT when intersection allows', () => {
    const days = [toDayEntry(flagged({}))];
    expect(getValidBulkReasons(days)).toContain('FORGOT');
  });

  it('starts with an empty stated clock-in', () => {
    expect(toDayEntry(flagged({})).clockInTime).toBe('');
  });
});
