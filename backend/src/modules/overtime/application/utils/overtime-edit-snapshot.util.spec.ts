import { describe, expect, it } from '@jest/globals';
import {
  buildOvertimeApprovedSnapshot,
  buildOvertimeEditDiff,
  describeOtType,
  enrichEditDiffWithApproverAdjustment,
  entryHoursIncreased,
  parseOvertimeApprovedSnapshot,
  type OvertimeApproverAdjustment,
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

  it('buildOvertimeEditDiff reports no edits when entries match the snapshot', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const diff = buildOvertimeEditDiff(snapshot, [baseEntry]);
    expect(diff?.editedAfterApproval).toBe(false);
    expect(diff?.entryChanges).toEqual([]);
  });

  it('buildOvertimeEditDiff includes whole previous and current entries', () => {
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
    expect(diff?.entryChanges?.[0]).toMatchObject({
      before: {
        date: '2026-10-15',
        otType: 'Normal (1.5×)',
        startTime: '18:00',
        endTime: '21:00',
        hours: '3h',
        reason: 'Pour concrete',
      },
      after: {
        date: '2026-10-16',
        otType: 'Sunday (2×)',
        startTime: '17:30',
        endTime: '22:00',
        hours: '4.5h',
        reason: 'Pour slab',
      },
    });
    expect(diff?.summaryLines?.[0]?.label).toBe('Updated · 2026-10-16');
    expect(diff?.summaryLines?.[0]?.from).toContain('Pour concrete');
    expect(diff?.summaryLines?.[0]?.to).toContain('Pour slab');
  });

  it('buildOvertimeEditDiff shows exact reason text for reason-only updates', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const after = {
      ...baseEntry,
      taskDescription: 'Pour slab and cure',
    };
    const diff = buildOvertimeEditDiff(snapshot, [after]);
    expect(diff?.reasonOnly).toBe(true);
    expect(diff?.entryChanges?.[0]?.before?.reason).toBe('Pour concrete');
    expect(diff?.entryChanges?.[0]?.after?.reason).toBe('Pour slab and cure');
  });

  it('buildOvertimeEditDiff includes whole values for added entries', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const added = {
      ...baseEntry,
      id: 'entry-2',
      date: '2026-10-17',
      taskDescription: 'Night pour',
    };
    const diff = buildOvertimeEditDiff(snapshot, [baseEntry, added]);
    const addedRow = diff?.entryChanges?.find((row) => row.added);
    expect(addedRow?.before).toBeNull();
    expect(addedRow?.after).toMatchObject({
      date: '2026-10-17',
      reason: 'Night pour',
    });
    expect(diff?.summaryLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Added · 2026-10-17',
          from: '—',
        }),
      ]),
    );
  });

  it('parseOvertimeApprovedSnapshot round-trips', () => {
    const snapshot = buildOvertimeApprovedSnapshot([baseEntry]);
    const parsed = parseOvertimeApprovedSnapshot(snapshot);
    expect(parsed?.entries[0]?.id).toBe('entry-1');
    expect(parsed?.entries[0]?.totalHours).toBe(3);
  });

  it('enrichEditDiffWithApproverAdjustment adds increase flags and hours summary', () => {
    const adjustment: OvertimeApproverAdjustment = {
      adjustedBy: 'approver-1',
      adjustedAt: '2026-11-28T10:00:00.000Z',
      overallNote: 'Adjusted for site hours',
      previousTotalHours: 3,
      newTotalHours: 5,
      changes: [
        {
          entryId: 'entry-1',
          kind: 'updated',
          reason: 'Extended evening pour',
          increased: true,
          before: {
            date: '2026-10-15',
            otType: 'Normal (1.5×)',
            startTime: '18:00',
            endTime: '21:00',
            hours: '3h',
            reason: 'Pour concrete',
          },
          after: {
            date: '2026-10-15',
            otType: 'Normal (1.5×)',
            startTime: '18:00',
            endTime: '23:00',
            hours: '5h',
            reason: 'Pour concrete',
          },
        },
      ],
    };
    const enriched = enrichEditDiffWithApproverAdjustment(null, adjustment);
    expect(enriched?.editedByApprover).toBe(true);
    expect(enriched?.editedAfterApproval).toBe(false);
    expect(enriched?.approverHoursSummary).toBe(
      'Approver changed hours from 3 to 5 (+2)',
    );
    expect(enriched?.entryChanges[0]?.increasedByApprover).toBe(true);
    expect(enriched?.entryChanges[0]?.reason).toBe('Extended evening pour');
  });

  it('entryHoursIncreased is true when hours go up or entry is added', () => {
    expect(
      entryHoursIncreased(null, {
        id: 'e1',
        date: '2026-10-15',
        startTime: '18:00',
        endTime: '20:00',
        endsAtEndOfDay: false,
        isHoliday: false,
        isOvernight: false,
        regularHours: 2,
        nightHours: 0,
        weekendHours: 0,
        holidayHours: 0,
        totalHours: 2,
        taskDescription: 'x',
      }),
    ).toBe(true);
    expect(
      entryHoursIncreased(
        {
          id: 'e1',
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
          taskDescription: 'x',
        },
        {
          id: 'e1',
          date: '2026-10-15',
          startTime: '18:00',
          endTime: '20:00',
          endsAtEndOfDay: false,
          isHoliday: false,
          isOvernight: false,
          regularHours: 2,
          nightHours: 0,
          weekendHours: 0,
          holidayHours: 0,
          totalHours: 2,
          taskDescription: 'x',
        },
      ),
    ).toBe(false);
  });
});
