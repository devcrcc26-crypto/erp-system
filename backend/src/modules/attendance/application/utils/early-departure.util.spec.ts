import { describe, expect, it } from '@jest/globals';
import {
  evaluateEarlyDeparture,
  isLateAfterGrace,
} from './early-departure.util';

describe('isLateAfterGrace', () => {
  it('within 15 min of start → not late', () => {
    expect(isLateAfterGrace('08:45', '08:30').isLate).toBe(false);
  });

  it('after start + 15 → late flag only', () => {
    const result = isLateAfterGrace('08:46', '08:30');
    expect(result.isLate).toBe(true);
    expect(result.lateMinutes).toBe(16);
  });
});

describe('evaluateEarlyDeparture', () => {
  const weekdayEnd = '17:30';
  const saturdayEnd = '12:30';

  it('17:15 → nothing (15-minute grace)', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '17:15',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('NONE');
    expect(r.appliedDeduction).toBe(0);
  });

  it('17:14 → flag only (just past the 15-minute grace)', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '17:14',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('FLAG');
    expect(r.appliedDeduction).toBe(0);
  });

  it('16:59 → flag only', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '16:59',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('FLAG');
    expect(r.appliedDeduction).toBe(0);
    expect(r.isEarlyLeaveFlag).toBe(true);
  });

  it('16:30 → flag only', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '16:30',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('FLAG');
    expect(r.appliedDeduction).toBe(0);
  });

  it('16:29 → 0.5 when ENFORCED', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '16:29',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('OVER_1H');
    expect(r.appliedDeduction).toBe(0.5);
    expect(r.wouldDeduct).toBe(0.5);
  });

  it('Saturday 12:15 → nothing (15-minute grace vs 12:30)', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '12:15',
      scheduledEnd: saturdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('NONE');
    expect(r.appliedDeduction).toBe(0);
    expect(r.isEarlyLeaveFlag).toBe(false);
  });

  it('Saturday 11:59 → flag only', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '11:59',
      scheduledEnd: saturdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('FLAG');
    expect(r.appliedDeduction).toBe(0);
    expect(r.isEarlyLeaveFlag).toBe(true);
  });

  it('Saturday 11:29 → 0.5; 11:30 → flag', () => {
    const over = evaluateEarlyDeparture({
      clockOut: '11:29',
      scheduledEnd: saturdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(over.band).toBe('OVER_1H');
    expect(over.appliedDeduction).toBe(0.5);

    const flag = evaluateEarlyDeparture({
      clockOut: '11:30',
      scheduledEnd: saturdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(flag.band).toBe('FLAG');
    expect(flag.appliedDeduction).toBe(0);
  });

  it('15:00 + approved EARLY_LEAVE → 0', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '15:00',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'APPROVED',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('COVERED_APPROVED');
    expect(r.appliedDeduction).toBe(0);
    expect(r.wouldDeduct).toBe(0);
  });

  it('15:00 + pending EARLY_LEAVE ENFORCED → 0.5', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '15:00',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'PENDING',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('PENDING_APPROVAL');
    expect(r.appliedDeduction).toBe(0.5);
  });

  it('15:00 + pending EARLY_LEAVE REPORT_ONLY → applied 0, would 0.5', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '15:00',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'PENDING',
      mode: 'REPORT_ONLY',
    });
    expect(r.band).toBe('PENDING_APPROVAL');
    expect(r.appliedDeduction).toBe(0);
    expect(r.wouldDeduct).toBe(0.5);
  });

  it('15:00 + rejected (NONE) EARLY_LEAVE → 0.5 ENFORCED', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '15:00',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'ENFORCED',
    });
    expect(r.band).toBe('OVER_1H');
    expect(r.appliedDeduction).toBe(0.5);
  });

  it('16:00 + approved FIELD_VISIT → 0', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '16:00',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'APPROVED',
      mode: 'ENFORCED',
    });
    expect(r.appliedDeduction).toBe(0);
    expect(r.band).toBe('COVERED_APPROVED');
  });

  it('REPORT_ONLY leaves appliedDeduction 0 but wouldDeduct 0.5', () => {
    const r = evaluateEarlyDeparture({
      clockOut: '15:00',
      scheduledEnd: weekdayEnd,
      fieldMovement: 'NONE',
      mode: 'REPORT_ONLY',
    });
    expect(r.band).toBe('OVER_1H');
    expect(r.appliedDeduction).toBe(0);
    expect(r.wouldDeduct).toBe(0.5);
  });
});
