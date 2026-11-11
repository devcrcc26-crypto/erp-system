import { describe, expect, it } from 'vitest';
import {
  canSelectWithCurrent,
  countStorageEntriesForCompatibleReason,
  deriveIssueType,
  idsForSelectAllCompatible,
  intersectionCompatibleReasons,
  resolveSelectAllAnchor,
} from '@/lib/generated/field-movement-issue-compatibility';

describe('field-movement-issue-compatibility', () => {
  it('intersection of five compatible issue types includes shared reasons', () => {
    const issues = [
      'MISSING_CLOCK_OUT',
      'MISSING_CLOCK_OUT',
      'MISSING_CLOCK_OUT',
      'MISSING_CLOCK_OUT',
      'MISSING_CLOCK_OUT',
    ] as const;
    const reasons = intersectionCompatibleReasons([...issues]);
    expect(reasons).toContain('FIELD_VISIT');
    expect(reasons).toContain('FORGOT_CLOCK_OUT');
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('MISSING_CLOCK_IN and EARLY_DEPARTURE cannot be selected together', () => {
    expect(
      canSelectWithCurrent('MISSING_CLOCK_IN', 'EARLY_DEPARTURE'),
    ).toBe(false);
    expect(
      canSelectWithCurrent('EARLY_DEPARTURE', 'MISSING_CLOCK_IN'),
    ).toBe(false);
  });

  it('select-all excludes incompatible issue groups', () => {
    const rows = [
      { id: 'a', issueType: 'MISSING_CLOCK_IN' as const, selectable: true },
      { id: 'b', issueType: 'MISSING_CLOCK_IN' as const, selectable: true },
      { id: 'c', issueType: 'EARLY_DEPARTURE' as const, selectable: true },
    ];
    const anchor = resolveSelectAllAnchor(rows, new Set(['a']));
    const ids = idsForSelectAllCompatible(rows, anchor);
    expect(ids).toEqual(['a', 'b']);
    expect(ids).not.toContain('c');
  });

  it('select-all preferred issue wins when selection is empty', () => {
    const rows = [
      { id: 'a', issueType: 'EARLY_DEPARTURE' as const, selectable: true },
      { id: 'b', issueType: 'MISSING_CLOCK_OUT' as const, selectable: true },
      { id: 'c', issueType: 'MISSING_CLOCK_OUT' as const, selectable: true },
    ];
    const anchor = resolveSelectAllAnchor(rows, new Set(), 'MISSING_CLOCK_OUT');
    expect(anchor).toBe('MISSING_CLOCK_OUT');
    expect(idsForSelectAllCompatible(rows, anchor)).toEqual(['b', 'c']);
  });

  it('FORGOT_BOTH counts as two storage entries', () => {
    expect(countStorageEntriesForCompatibleReason('FORGOT_BOTH')).toBe(2);
    expect(countStorageEntriesForCompatibleReason('FIELD_VISIT')).toBe(1);
  });

  it('deriveIssueType uses NO_SCANS when both scans missing', () => {
    expect(
      deriveIssueType({
        flag: 'MISSING_CLOCK_IN',
        clockInLocal: null,
        clockOutLocal: null,
      }),
    ).toBe('NO_SCANS');
  });
});
