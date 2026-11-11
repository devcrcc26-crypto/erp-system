import {
  canSelectWithCurrent,
  compatibleReasonsForIssue,
  deriveIssueType,
  idsForSelectAllCompatible,
  intersectionCompatibleReasons,
} from './field-movement-issue-compatibility';

describe('field-movement-issue-compatibility', () => {
  it('derives NO_SCANS when neither scan exists', () => {
    expect(
      deriveIssueType({
        flag: 'MISSING_CLOCK_IN',
        clockInLocal: null,
        clockOutLocal: null,
      }),
    ).toBe('NO_SCANS');
  });

  it('maps EARLY_LEAVE flag to EARLY_DEPARTURE when a scan exists', () => {
    expect(
      deriveIssueType({
        flag: 'EARLY_LEAVE',
        clockInLocal: '08:00',
        clockOutLocal: '15:00',
      }),
    ).toBe('EARLY_DEPARTURE');
  });

  it('intersection of MISSING_CLOCK_IN and EARLY_DEPARTURE is FIELD_VISIT only', () => {
    expect(
      intersectionCompatibleReasons(['MISSING_CLOCK_IN', 'EARLY_DEPARTURE']),
    ).toEqual(['FIELD_VISIT']);
  });

  it('same-issue select-all excludes other issue groups', () => {
    const ids = idsForSelectAllCompatible(
      [
        { id: 'a', issueType: 'MISSING_CLOCK_OUT', selectable: true },
        { id: 'b', issueType: 'MISSING_CLOCK_OUT', selectable: true },
        { id: 'c', issueType: 'EARLY_DEPARTURE', selectable: true },
      ],
      'MISSING_CLOCK_OUT',
    );
    expect(ids).toEqual(['a', 'b']);
  });

  it('canSelectWithCurrent blocks mixing issue groups', () => {
    expect(canSelectWithCurrent('MISSING_CLOCK_IN', 'EARLY_DEPARTURE')).toBe(
      false,
    );
    expect(canSelectWithCurrent(null, 'EARLY_DEPARTURE')).toBe(true);
  });

  it('NO_SCANS offers FIELD_VISIT and FORGOT_BOTH', () => {
    expect(compatibleReasonsForIssue('NO_SCANS')).toEqual([
      'FIELD_VISIT',
      'FORGOT_BOTH',
    ]);
  });
});
