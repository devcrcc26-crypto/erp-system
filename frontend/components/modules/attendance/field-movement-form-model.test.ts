import { describe, expect, it } from 'vitest';
import type { FlaggedDay } from '@/lib/api/attendance.types';
import {
  dayIsFullyExplained,
  storageEntryCountForDay,
  toDayEntry,
  validationErrorsForDay,
} from './field-movement-form-model';

function flagged(partial: Partial<FlaggedDay> = {}): FlaggedDay {
  return {
    id: 'log-1',
    date: '2026-08-03',
    flag: 'MISSING_CLOCK_OUT',
    clockInLocal: '08:00',
    clockOutLocal: null,
    correctedClockInLocal: null,
    correctedClockOutLocal: null,
    isHalfDay: false,
    availableReasons: ['FIELD_VISIT', 'EARLY_LEAVE', 'FORGOT_CLOCK_OUT'],
    alreadySubmitted: false,
    submittedLog: null,
    ...partial,
  };
}

describe('field-movement-form-model validation', () => {
  it('blocks submit when a selected row fails the matrix', () => {
    const day = {
      ...toDayEntry(flagged()),
      selected: true,
      reasonType: 'FIELD_VISIT' as const,
      location: '',
      timeOut: '10:00',
      reasonNote: 'Site visit',
    };
    expect(dayIsFullyExplained(day)).toBe(false);
    expect(validationErrorsForDay(day).location).toBeTruthy();
  });

  it('Both counts as two storage entries', () => {
    const day = {
      ...toDayEntry(
        flagged({
          flag: 'MISSING_CLOCK_IN',
          clockInLocal: null,
          clockOutLocal: null,
        }),
      ),
      selected: true,
      reasonType: 'FORGOT' as const,
      forgotDirection: 'BOTH' as const,
      clockInTime: '08:00',
      clockOutTime: '17:00',
      reasonNote: 'Missed both scans',
    };
    expect(storageEntryCountForDay(day)).toBe(2);
    expect(dayIsFullyExplained(day)).toBe(true);
  });

  it('EARLY_LEAVE requires timeOut', () => {
    const day = {
      ...toDayEntry(flagged()),
      selected: true,
      reasonType: 'EARLY_LEAVE' as const,
      reasonNote: 'Doctor appointment',
    };
    expect(validationErrorsForDay(day).timeOut).toBeTruthy();
  });
});
