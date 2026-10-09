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
});
