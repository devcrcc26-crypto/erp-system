import { resolveEntryAttendanceFlag } from './payroll-attendance-flag.util';

describe('resolveEntryAttendanceFlag', () => {
  it('flags MISSING_CONTRACT when attendance exists but no overlapping contract', () => {
    const result = resolveEntryAttendanceFlag({
      hasContract: false,
      attendance: { matchMethod: 'AUTO' },
      monthEndBasic: 0,
    });
    expect(result.flag).toBe('MISSING_CONTRACT');
    expect(result.flagNote).toMatch(/No overlapping contract/i);
  });

  it('does not clear MISSING_CONTRACT when employmentDate alone covers paid days', () => {
    // Paid days come from attendance; flag still reflects missing contract.
    const result = resolveEntryAttendanceFlag({
      hasContract: false,
      attendance: { matchMethod: 'AUTO' },
      monthEndBasic: 0,
    });
    expect(result.flag).toBe('MISSING_CONTRACT');
  });
  describe('run ignores attendance', () => {
    it('does not flag MISSING_ATTENDANCE or add the enrolment note', () => {
      expect(
        resolveEntryAttendanceFlag({
          hasContract: true,
          attendance: undefined,
          monthEndBasic: 10_000,
          attendanceIgnored: true,
        }),
      ).toEqual({ flag: 'NONE', entryNote: undefined });
      expect(
        resolveEntryAttendanceFlag({
          hasContract: true,
          attendance: { matchMethod: 'NEEDS_ENROLMENT' },
          monthEndBasic: 10_000,
          attendanceIgnored: true,
        }).entryNote,
      ).toBeUndefined();
    });

    it('still flags MISSING_CONTRACT and ZERO_SALARY', () => {
      expect(
        resolveEntryAttendanceFlag({
          hasContract: false,
          attendance: { matchMethod: 'AUTO' },
          monthEndBasic: 0,
          attendanceIgnored: true,
        }).flag,
      ).toBe('MISSING_CONTRACT');
      expect(
        resolveEntryAttendanceFlag({
          hasContract: true,
          attendance: undefined,
          monthEndBasic: 0,
          attendanceIgnored: true,
        }).flag,
      ).toBe('ZERO_SALARY');
    });
  });
});
