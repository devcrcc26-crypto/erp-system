import {
  PAYROLL_MONTH_DAYS,
  allocateContractPayrollDays,
  employedPayrollDays,
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

  it('joiner Aug 17 with one absence → employed 14 (payroll days 13 after absence)', () => {
    const employed = employedPayrollDays(8, 2026, d(2026, 8, 17), null);
    expect(employed.days).toBe(14);
    expect(employed.days - 1).toBe(13);
  });

  it('returns 0 when employment does not overlap the month', () => {
    expect(employedPayrollDays(8, 2026, d(2026, 9, 1), null).days).toBe(0);
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
