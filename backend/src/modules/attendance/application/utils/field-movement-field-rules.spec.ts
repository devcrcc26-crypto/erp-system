import {
  clearHiddenFieldValues,
  countStorageEntries,
  getVisibleFieldRules,
  resolveFieldPresence,
  toStorageEntries,
  validateFieldMovementValues,
  validateStorageEntry,
} from './field-movement-field-rules';

describe('field-movement-field-rules', () => {
  describe('resolveFieldPresence / getVisibleFieldRules', () => {
    it('FIELD_VISIT: required date, timeOut, location, reasonNote; optional returnTime + attachment', () => {
      const presence = resolveFieldPresence({ reasonType: 'FIELD_VISIT' });
      expect(presence.date).toBe('required');
      expect(presence.timeOut).toBe('required');
      expect(presence.returnTime).toBe('optional');
      expect(presence.location).toBe('required');
      expect(presence.reasonNote).toBe('required');
      expect(presence.attachment).toBe('optional');
      expect(presence.clockInTime).toBe('hidden');
      expect(presence.clockOutTime).toBe('hidden');
      expect(presence.forgotDirection).toBe('hidden');
      expect(
        getVisibleFieldRules({ reasonType: 'FIELD_VISIT' }).map((r) => r.key),
      ).toEqual([
        'date',
        'timeOut',
        'returnTime',
        'location',
        'reasonNote',
        'attachment',
      ]);
    });

    it('EARLY_LEAVE: required date, timeOut, reasonNote; hides location and clocks', () => {
      const presence = resolveFieldPresence({ reasonType: 'EARLY_LEAVE' });
      expect(presence.timeOut).toBe('required');
      expect(presence.reasonNote).toBe('required');
      expect(presence.location).toBe('hidden');
      expect(presence.returnTime).toBe('hidden');
      expect(presence.clockInTime).toBe('hidden');
    });

    it.each([
      ['IN', { clockInTime: 'required', clockOutTime: 'hidden' }],
      ['OUT', { clockInTime: 'hidden', clockOutTime: 'required' }],
      ['BOTH', { clockInTime: 'required', clockOutTime: 'required' }],
    ] as const)(
      'FORGOT %s shows the correct clock fields',
      (direction, expected) => {
        const presence = resolveFieldPresence({
          reasonType: 'FORGOT',
          forgotDirection: direction,
        });
        expect(presence.forgotDirection).toBe('required');
        expect(presence.clockInTime).toBe(expected.clockInTime);
        expect(presence.clockOutTime).toBe(expected.clockOutTime);
        expect(presence.timeOut).toBe('hidden');
        expect(presence.location).toBe('hidden');
      },
    );
  });

  describe('clearHiddenFieldValues', () => {
    it('clears location and returnTime when switching to EARLY_LEAVE', () => {
      const cleared = clearHiddenFieldValues(
        { reasonType: 'EARLY_LEAVE' },
        {
          location: 'Site A',
          timeOut: '15:00',
          returnTime: '17:00',
          reasonNote: 'Leaving',
          clockInTime: '08:00',
        },
      );
      expect(cleared.location).toBe('');
      expect(cleared.returnTime).toBe('');
      expect(cleared.clockInTime).toBe('');
      expect(cleared.timeOut).toBe('15:00');
      expect(cleared.reasonNote).toBe('Leaving');
    });
  });

  describe('validateFieldMovementValues', () => {
    it('rejects returnTime ≤ timeOut', () => {
      const issues = validateFieldMovementValues(
        { reasonType: 'FIELD_VISIT' },
        {
          date: '2026-08-01',
          timeOut: '16:00',
          returnTime: '15:00',
          location: 'Ring Road site',
          reasonNote: 'Client visit',
        },
        { requireDate: false },
      );
      expect(issues.some((i) => i.code === 'RETURN_AFTER_TIMEOUT')).toBe(true);
    });

    it('rejects FIELD_VISIT without location', () => {
      const issues = validateFieldMovementValues(
        { reasonType: 'FIELD_VISIT' },
        {
          timeOut: '10:00',
          reasonNote: 'Visit',
        },
        { requireDate: false },
      );
      expect(issues.some((i) => i.field === 'location')).toBe(true);
    });

    it('rejects EARLY_LEAVE without timeOut', () => {
      const issues = validateFieldMovementValues(
        { reasonType: 'EARLY_LEAVE' },
        { reasonNote: 'Doctor appointment' },
        { requireDate: false },
      );
      expect(issues.some((i) => i.field === 'timeOut')).toBe(true);
    });

    it('rejects hidden location on EARLY_LEAVE when provided', () => {
      const issues = validateFieldMovementValues(
        { reasonType: 'EARLY_LEAVE' },
        {
          timeOut: '15:00',
          reasonNote: 'Doctor',
          location: 'Should not be here',
        },
        { requireDate: false },
      );
      expect(issues.some((i) => i.code === 'FIELD_NOT_ALLOWED')).toBe(true);
    });
  });

  describe('toStorageEntries / countStorageEntries', () => {
    it('Both creates two entries and counts as 2', () => {
      const selection = {
        reasonType: 'FORGOT' as const,
        forgotDirection: 'BOTH' as const,
      };
      expect(countStorageEntries(selection)).toBe(2);
      const entries = toStorageEntries(selection, {
        clockInTime: '08:15',
        clockOutTime: '17:30',
        reasonNote: 'Missed both scans',
      });
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        reason: 'FORGOT_CLOCK_IN',
        returnTime: '08:15',
      });
      expect(entries[1]).toMatchObject({
        reason: 'FORGOT_CLOCK_OUT',
        departureTime: '17:30',
      });
    });
  });

  describe('validateStorageEntry', () => {
    it('rejects FIELD_VISIT without location', () => {
      const issues = validateStorageEntry({
        reason: 'FIELD_VISIT',
        departureTime: '10:00',
        notes: 'Visit',
      });
      expect(issues.some((i) => i.field === 'location')).toBe(true);
    });

    it('rejects EARLY_LEAVE without timeOut', () => {
      const issues = validateStorageEntry({
        reason: 'EARLY_LEAVE',
        notes: 'Leaving early',
      });
      expect(issues.some((i) => i.field === 'timeOut')).toBe(true);
    });
  });
});
