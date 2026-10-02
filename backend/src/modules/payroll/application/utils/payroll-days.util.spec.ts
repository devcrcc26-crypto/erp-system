import {
  PAYROLL_MONTH_DAYS,
  employedPayrollDays,
} from './payroll-days.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe('employedPayrollDays', () => {
  it('full month in August (31 days) → 30', () => {
    const result = employedPayrollDays(8, 2026, d(2025, 1, 1), null);
    expect(result.days).toBe(30);
    expect(result.startDay).toBe(1);
    expect(result.endDay).toBe(PAYROLL_MONTH_DAYS);
  });

  it('full month in February → 30', () => {
    const result = employedPayrollDays(2, 2026, d(2025, 1, 1), null);
    expect(result.days).toBe(30);
  });

  it('joined June 8 → 23', () => {
    const result = employedPayrollDays(6, 2026, d(2026, 6, 8), null);
    expect(result.days).toBe(23);
    expect(result.startDay).toBe(8);
    expect(result.endDay).toBe(30);
  });

  it('joined August 8 → 23', () => {
    const result = employedPayrollDays(8, 2026, d(2026, 8, 8), null);
    expect(result.days).toBe(23);
    expect(result.startDay).toBe(8);
    expect(result.endDay).toBe(30);
  });

  it('left August 31 → 30', () => {
    const result = employedPayrollDays(
      8,
      2026,
      d(2025, 1, 1),
      d(2026, 8, 31),
    );
    expect(result.days).toBe(30);
    expect(result.endDay).toBe(30);
  });

  it('left August 15 → 15', () => {
    const result = employedPayrollDays(
      8,
      2026,
      d(2025, 1, 1),
      d(2026, 8, 15),
    );
    expect(result.days).toBe(15);
    expect(result.endDay).toBe(15);
  });

  it('joined Feb 10, still employed → 21', () => {
    const result = employedPayrollDays(2, 2026, d(2026, 2, 10), null);
    expect(result.days).toBe(21);
    expect(result.startDay).toBe(10);
    expect(result.endDay).toBe(30);
  });

  it('joined June 8 — pre-start absences do not affect employed window (still 23)', () => {
    // Absences are applied by the run service; this util only returns the window.
    const result = employedPayrollDays(6, 2026, d(2026, 6, 8), null);
    expect(result.days).toBe(23);
  });

  it('salary change on the 16th → earned = 11,000 for full month', () => {
    const first = employedPayrollDays(
      8,
      2026,
      d(2025, 1, 1),
      d(2026, 8, 15),
    );
    const second = employedPayrollDays(
      8,
      2026,
      d(2026, 8, 16),
      null,
    );
    expect(first.days).toBe(15);
    expect(second.days).toBe(15);
    const earned =
      (10000 / 30) * first.days + (12000 / 30) * second.days;
    expect(Math.round(earned * 100) / 100).toBe(11000);
  });

  it('returns 0 when contract does not overlap the month', () => {
    const result = employedPayrollDays(
      8,
      2026,
      d(2026, 9, 1),
      null,
    );
    expect(result.days).toBe(0);
  });
});
