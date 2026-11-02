import {
  PAYROLL_MONTH_DAYS,
  allocateContractPayrollDays,
  employedPayrollDays,
  resolveEmploymentSegmentsForMonth,
} from './payroll-days.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('employedPayrollDays', () => {
  it('full month Aug/Feb/Sep → 30', () => {
    expect(employedPayrollDays(8, 2026, d(2025, 1, 1), null).days).toBe(30);
    expect(employedPayrollDays(2, 2026, d(2025, 1, 1), null).days).toBe(30);
    expect(employedPayrollDays(9, 2026, d(2025, 1, 1), null).days).toBe(30);
  });

  it('joiners: Sep 5 / Feb 5 / Aug 5 → 26; Jun 8 → 23; Aug 1 → 30; Aug 31 → 1', () => {
    expect(employedPayrollDays(9, 2026, d(2026, 9, 5), null).days).toBe(26);
    expect(employedPayrollDays(2, 2026, d(2026, 2, 5), null).days).toBe(26);
    expect(employedPayrollDays(8, 2026, d(2026, 8, 5), null).days).toBe(26);
    expect(employedPayrollDays(6, 2026, d(2026, 6, 8), null).days).toBe(23);
    expect(employedPayrollDays(8, 2026, d(2026, 8, 1), null).days).toBe(30);
    expect(employedPayrollDays(8, 2026, d(2026, 8, 31), null).days).toBe(1);
  });

  it('Part C joiners: Aug 24 → 7; Aug 17 → 14; Feb 28 non-leap → 3; Feb 29 leap → 2; Feb 1 → 30', () => {
    expect(employedPayrollDays(8, 2026, d(2026, 8, 24), null).days).toBe(7);
    expect(employedPayrollDays(8, 2026, d(2026, 8, 17), null).days).toBe(14);
    expect(employedPayrollDays(2, 2026, d(2026, 2, 28), null).days).toBe(3);
    expect(employedPayrollDays(2, 2024, d(2024, 2, 29), null).days).toBe(2);
    expect(employedPayrollDays(2, 2026, d(2026, 2, 1), null).days).toBe(30);
  });

  it('split contract Feb 27/28 → 27 + 3 = 30', () => {
    const parts = allocateContractPayrollDays(
      2,
      2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 2, 27) },
        { id: 'new', startDate: d(2026, 2, 28), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    expect(parts.map((p) => p.days)).toEqual([27, 3]);
    expect(parts.reduce((s, p) => s + p.days, 0)).toBe(PAYROLL_MONTH_DAYS);
  });

  it('leavers: Aug 15 → 15; Aug 31 → 30; Feb 28 (non-leap) → 30', () => {
    expect(
      employedPayrollDays(8, 2026, d(2025, 1, 1), d(2026, 8, 15)).days,
    ).toBe(15);
    expect(
      employedPayrollDays(8, 2026, d(2025, 1, 1), d(2026, 8, 31)).days,
    ).toBe(30);
    expect(
      employedPayrollDays(2, 2026, d(2025, 1, 1), d(2026, 2, 28)).days,
    ).toBe(30);
  });

  it('termination date is the inclusive last paid day (Sep 20 → 20 days, earned 20k of 30k)', () => {
    const days = employedPayrollDays(
      9,
      2026,
      d(2025, 1, 1),
      d(2026, 9, 20),
    ).days;
    expect(days).toBe(20);
    expect(Math.round((30_000 / 30) * days)).toBe(20_000);
    // Must not treat the leaving date as exclusive (that would yield 19 / 19_000).
    expect(days).not.toBe(19);
  });

  it('joiner Aug 17 with one absence → employed 14 (payroll days 13 after absence)', () => {
    const employed = employedPayrollDays(8, 2026, d(2026, 8, 17), null);
    expect(employed.days).toBe(14);
    expect(employed.days - 1).toBe(13);
  });

  it('returns 0 when employment does not overlap the month', () => {
    expect(employedPayrollDays(8, 2026, d(2026, 9, 1), null).days).toBe(0);
  });
});

describe('resolveEmploymentSegmentsForMonth', () => {
  it('uses overlapping contracts when present', () => {
    const segments = resolveEmploymentSegmentsForMonth({
      overlappingContracts: [{ startDate: d(2026, 8, 1), endDate: null }],
      employmentDate: d(2026, 8, 17),
    });
    expect(segments).toEqual([{ startDate: d(2026, 8, 1), endDate: null }]);
  });

  it('falls back to employmentDate when no contract (not whole month)', () => {
    const segments = resolveEmploymentSegmentsForMonth({
      overlappingContracts: [],
      employmentDate: d(2026, 8, 17),
    });
    expect(segments).toEqual([{ startDate: d(2026, 8, 17), endDate: null }]);
    expect(
      employedPayrollDays(8, 2026, segments[0].startDate, segments[0].endDate)
        .days,
    ).toBe(14);
  });

  it('returns empty when no contract and no employmentDate', () => {
    expect(
      resolveEmploymentSegmentsForMonth({
        overlappingContracts: [],
        employmentDate: null,
      }),
    ).toEqual([]);
  });
});

describe('allocateContractPayrollDays (renewals)', () => {
  it('Aug 4 renewal → 3 + 27', () => {
    const parts = allocateContractPayrollDays(
      8,
      2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 8, 3) },
        { id: 'new', startDate: d(2026, 8, 4), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    expect(parts.map((p) => p.days)).toEqual([3, 27]);
    expect(parts.reduce((s, p) => s + p.days, 0)).toBe(PAYROLL_MONTH_DAYS);
  });

  it('Feb 15 renewal → 14 + 16', () => {
    const parts = allocateContractPayrollDays(
      2,
      2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 2, 14) },
        { id: 'new', startDate: d(2026, 2, 15), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    expect(parts.map((p) => p.days)).toEqual([14, 16]);
  });

  it('renewal Aug 4, basic 50k → 70k → earned 68,000', () => {
    const parts = allocateContractPayrollDays(
      8,
      2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 8, 3) },
        { id: 'new', startDate: d(2026, 8, 4), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    const earned =
      (50000 / 30) * parts[0].days + (70000 / 30) * parts[1].days;
    expect(Math.round(earned * 100) / 100).toBe(68000);
  });

  it('employment span (not renewal start) keeps full month when renewing mid-month', () => {
    const employment = employedPayrollDays(8, 2026, d(2025, 1, 1), null);
    expect(employment.days).toBe(30);
    const parts = allocateContractPayrollDays(
      8,
      2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 8, 15) },
        { id: 'new', startDate: d(2026, 8, 16), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    expect(parts.map((p) => p.days)).toEqual([15, 15]);
  });
});
