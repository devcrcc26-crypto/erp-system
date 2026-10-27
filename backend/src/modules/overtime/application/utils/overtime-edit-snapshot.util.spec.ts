import { describe, expect, it } from '@jest/globals';
import {
  buildOvertimeApprovedSnapshot,
  buildOvertimeEditDiff,
  describeOtType,
  parseOvertimeApprovedSnapshot,
} from './overtime-edit-snapshot.util';

describe('overtime-edit-snapshot.util', () => {
  const baseEntry = {
    id: 'entry-1',
    date: '2026-10-15',
    startTime: '18:00',
    endTime: '21:00',
    endsAtEndOfDay: false,
    isHoliday: false,
    isOvernight: false,
    regularHours: 3,
    nightHours: 0,
    weekendHours: 0,
    holidayHours: 0,
    totalHours: 3,
    taskDescription: 'Pour concrete',
  };

  it('describeOtType prefers holiday then weekend then evening then normal', () => {
    expect(describeOtType(baseEntry)).toBe('Normal (1.5×)');
    expect(
      describeOtType({ ...baseEntry, nightHours: 1, regularHours: 2 }),
    ).toBe('Evening (1.75×) + Normal (1.5×)');
    expect(
      describeOtType({
        ...baseEntry,
        regularHours: 0,
        weekendHours: 4,
        totalHours: 4,
      }),
    ).toBe('Sunday (2×)');
  });

  it('buildOvertimeEditDiff returns null without a snapshot', () => {
    expect(buildOvertimeEditDiff(null, [baseEntry])).toBeNull();
  });

  it('buildOvertimeEditDiff lists exact before/after for every changed field', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const after = {
      ...baseEntry,
      date: '2026-10-16',
      startTime: '17:30',
      endTime: '22:00',
      regularHours: 0,
      weekendHours: 4.5,
      totalHours: 4.5,
      taskDescription: 'Pour slab',
    };
    const diff = buildOvertimeEditDiff(snapshot, [after]);
    expect(diff?.editedAfterApproval).toBe(true);
    expect(diff?.reasonOnly).toBe(false);
    expect(diff?.summaryLines).toEqual(
      expect.arrayContaining([
        { label: 'Date', from: '2026-10-15', to: '2026-10-16' },
        {
          label: 'OT Type',
          from: 'Normal (1.5×)',
          to: 'Sunday (2×)',
        },
        { label: 'Start time', from: '18:00', to: '17:30' },
        { label: 'End time', from: '21:00', to: '22:00' },
        { label: 'Hours', from: '3h', to: '4.5h' },
        { label: 'Reason', from: 'Pour concrete', to: 'Pour slab' },
      ]),
    );
    expect(diff?.entryChanges?.[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: 'reason', from: 'Pour concrete', to: 'Pour slab' },
      ]),
    );
  });

  it('buildOvertimeEditDiff shows exact reason text for reason-only updates', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const after = {
      ...baseEntry,
      taskDescription: 'Pour slab and cure',
    };
    const diff = buildOvertimeEditDiff(snapshot, [after]);
    expect(diff?.reasonOnly).toBe(true);
    expect(diff?.summaryLines).toEqual([
      {
        label: 'Reason',
        from: 'Pour concrete',
        to: 'Pour slab and cure',
      },
    ]);
  });

  it('buildOvertimeEditDiff includes exact values for added entries', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const added = {
      ...baseEntry,
      id: 'entry-2',
      date: '2026-10-17',
      taskDescription: 'Night pour',
    };
    const diff = buildOvertimeEditDiff(snapshot, [baseEntry, added]);
    expect(diff?.entryChanges?.some((row) => row.added)).toBe(true);
    expect(diff?.summaryLines).toEqual(
      expect.arrayContaining([
        {
          label: 'Added · 2026-10-17 · Date',
          from: '—',
          to: '2026-10-17',
        },
        {
          label: 'Added · 2026-10-17 · Reason',
          from: '—',
          to: 'Night pour',
        },
      ]),
    );
  });

  it('parseOvertimeApprovedSnapshot round-trips', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const parsed = parseOvertimeApprovedSnapshot(snapshot);
    expect(parsed?.entries[0]?.id).toBe('entry-1');
    expect(parsed?.entries[0]?.totalHours).toBe(3);
  });
});
