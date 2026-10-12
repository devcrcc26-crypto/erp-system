import { describe, expect, it } from 'vitest';
import { explainDayRowIsValid } from './explain-days-validation';

describe('explain-days validation', () => {
  it('invalid row blocks save when field visit has no location', () => {
    const ok = explainDayRowIsValid(
      { reasonType: 'FIELD_VISIT', forgotDirection: null },
      { location: '', timeOut: '10:00', reasonNote: 'Visit' },
      {
        date: '2026-08-03',
        isHalfDay: false,
        scheduledEndTime: '17:30',
        scheduledStartTime: '08:00',
        clockInLocal: '08:02',
        clockOutLocal: null,
        correctedClockInLocal: null,
        correctedClockOutLocal: null,
      },
    );
    expect(ok).toBe(false);
  });

  it('clock-out must be after existing clock-in', () => {
    const ok = explainDayRowIsValid(
      { reasonType: 'FORGOT', forgotDirection: 'OUT' },
      { clockOutTime: '07:00', reasonNote: 'Forgot' },
      {
        date: '2026-08-03',
        isHalfDay: false,
        scheduledEndTime: '17:30',
        scheduledStartTime: '08:00',
        clockInLocal: '08:02',
        clockOutLocal: null,
        correctedClockInLocal: null,
        correctedClockOutLocal: null,
      },
    );
    expect(ok).toBe(false);
  });
});
