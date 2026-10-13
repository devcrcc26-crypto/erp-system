import { describe, expect, it } from 'vitest';
import {
  clearHiddenFieldValues,
  countStorageEntries,
  getVisibleFieldRules,
  resolveFieldPresence,
  toStorageEntries,
  validateFieldMovementValues,
} from '@/lib/generated/field-movement-field-rules';

describe('shared field-movement-field-rules (frontend import)', () => {
  it.each([
    [
      'FIELD_VISIT',
      { reasonType: 'FIELD_VISIT' as const },
      ['date', 'timeOut', 'returnTime', 'location', 'reasonNote', 'attachment'],
    ],
    [
      'EARLY_LEAVE',
      { reasonType: 'EARLY_LEAVE' as const },
      ['date', 'timeOut', 'reasonNote', 'attachment'],
    ],
    [
      'FORGOT IN',
      { reasonType: 'FORGOT' as const, forgotDirection: 'IN' as const },
      ['date', 'clockInTime', 'forgotDirection', 'reasonNote', 'attachment'],
    ],
    [
      'FORGOT OUT',
      { reasonType: 'FORGOT' as const, forgotDirection: 'OUT' as const },
      ['date', 'clockOutTime', 'forgotDirection', 'reasonNote', 'attachment'],
    ],
    [
      'FORGOT BOTH',
      { reasonType: 'FORGOT' as const, forgotDirection: 'BOTH' as const },
      [
        'date',
        'clockInTime',
        'clockOutTime',
        'forgotDirection',
        'reasonNote',
        'attachment',
      ],
    ],
  ])('%s visible fields match the matrix', (_label, selection, keys) => {
    expect(getVisibleFieldRules(selection).map((rule) => rule.key)).toEqual(
      keys,
    );
    const presence = resolveFieldPresence(selection);
    for (const key of keys) {
      expect(presence[key] === 'required' || presence[key] === 'optional').toBe(
        true,
      );
    }
    expect(presence.returnTime === 'optional' || presence.returnTime === 'hidden').toBe(
      true,
    );
    if (selection.reasonType === 'FIELD_VISIT') {
      expect(presence.returnTime).toBe('optional');
      expect(presence.location).toBe('required');
    }
  });

  it('required fields never also optional; optional never also required', () => {
    for (const selection of [
      { reasonType: 'FIELD_VISIT' as const },
      { reasonType: 'EARLY_LEAVE' as const },
      { reasonType: 'FORGOT' as const, forgotDirection: 'BOTH' as const },
    ]) {
      for (const rule of getVisibleFieldRules(selection)) {
        expect(rule.presence === 'required' || rule.presence === 'optional').toBe(
          true,
        );
      }
    }
  });

  it('switching reason clears hidden values', () => {
    const cleared = clearHiddenFieldValues(
      { reasonType: 'EARLY_LEAVE' },
      {
        location: 'Site',
        timeOut: '15:00',
        returnTime: '16:00',
        clockInTime: '08:00',
        reasonNote: 'Note',
      },
    );
    expect(cleared.location).toBe('');
    expect(cleared.returnTime).toBe('');
    expect(cleared.clockInTime).toBe('');
    expect(cleared.timeOut).toBe('15:00');
  });

  it('rejects returnTime ≤ timeOut', () => {
    const issues = validateFieldMovementValues(
      { reasonType: 'FIELD_VISIT' },
      {
        timeOut: '16:00',
        returnTime: '16:00',
        location: 'Ring Road',
        reasonNote: 'Visit client',
      },
      { requireDate: false },
    );
    expect(issues.some((issue) => issue.code === 'RETURN_AFTER_TIMEOUT')).toBe(
      true,
    );
  });

  it('Both creates two storage entries', () => {
    expect(
      countStorageEntries({
        reasonType: 'FORGOT',
        forgotDirection: 'BOTH',
      }),
    ).toBe(2);
    expect(
      toStorageEntries(
        { reasonType: 'FORGOT', forgotDirection: 'BOTH' },
        {
          clockInTime: '08:00',
          clockOutTime: '17:00',
          reasonNote: 'Missed both',
        },
      ),
    ).toHaveLength(2);
  });
});
