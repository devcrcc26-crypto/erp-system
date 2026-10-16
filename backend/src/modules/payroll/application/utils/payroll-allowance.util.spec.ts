import { describe, expect, it } from '@jest/globals';
import {
  allocateContractPayrollDays,
  employedPayrollDays,
} from './payroll-days.util';
import { computeContractAllowances } from './payroll-allowance.util';
import { PayrollCalculationService } from '../services/payroll-calculation.service';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';

const LEAVER_ALLOWANCE_MODE = POLICY_DEFAULTS.leaverAllowanceMode;
const ALLOWANCES_REDUCED_BY_ABSENCE = POLICY_DEFAULTS.allowancesReducedByAbsence;

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build slices from allocations + contract amounts for use in tests. */
function slices(
  contracts: Array<{ transport: number; bonus: number }>,
  allocatedDays: number[],
) {
  return contracts.map((c, i) => ({
    transportationAllowance: c.transport,
    monthlyBonus: c.bonus,
    allocatedDays: allocatedDays[i],
  }));
}

// ---------------------------------------------------------------------------
// computeContractAllowances - unit tests
// ---------------------------------------------------------------------------

describe('computeContractAllowances', () => {
  const PRORATED = 'PRORATED' as const;
  const FULL = 'FULL' as const;

  it('full month, one contract → full amounts', () => {
    const result = computeContractAllowances(
      [{ transportationAllowance: 2550, monthlyBonus: 56000, allocatedDays: 30 }],
      30, 30, 30, PRORATED, false,
    );
    expect(result.transport).toBe(2550);
    expect(result.monthlyBonus).toBe(56000);
  });

  it('joiner Aug 17 (14 employed days) → × 14/30', () => {
    const result = computeContractAllowances(
      [{ transportationAllowance: 2550, monthlyBonus: 56000, allocatedDays: 14 }],
      14, 14, 14, PRORATED, false,
    );
    expect(result.transport).toBeCloseTo(2550 * 14 / 30, 2);
    expect(result.monthlyBonus).toBeCloseTo(56000 * 14 / 30, 2);
  });

  it('joiner Aug 24 (7 employed days) → × 7/30', () => {
    const result = computeContractAllowances(
      [{ transportationAllowance: 2800, monthlyBonus: 60846.16, allocatedDays: 7 }],
      7, 7, 7, PRORATED, false,
    );
    expect(result.transport).toBeCloseTo(2800 * 7 / 30, 2);
    expect(result.monthlyBonus).toBeCloseTo(60846.16 * 7 / 30, 2);
  });

  it('renewal Aug 4 → 3/30 old + 27/30 new', () => {
    const old = { transport: 2550, bonus: 56000 };
    const nw = { transport: 2800, bonus: 60846.16 };
    const result = computeContractAllowances(
      slices([old, nw], [3, 27]),
      30, 30, 30, PRORATED, false,
    );
    expect(result.transport).toBeCloseTo(old.transport * 3 / 30 + nw.transport * 27 / 30, 2);
    expect(result.monthlyBonus).toBeCloseTo(old.bonus * 3 / 30 + nw.bonus * 27 / 30, 2);
  });

  it('contract splits always total 30 days (renewal Aug 4)', () => {
    const parts = allocateContractPayrollDays(
      8, 2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 8, 3) },
        { id: 'new', startDate: d(2026, 8, 4), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    expect(parts.reduce((s, p) => s + p.days, 0)).toBe(30);
  });

  it('Abenezer renewal Aug 24 → transport 2,608.33, bonus 57,130.77', () => {
    // Contracts: old 50k/2550/56000 for 23 d, new 70k/2800/60846.16 for 7 d
    const parts = allocateContractPayrollDays(
      8, 2026,
      [
        { id: 'old', startDate: d(2025, 8, 24), endDate: d(2026, 8, 23) },
        { id: 'new', startDate: d(2026, 8, 24), endDate: null },
      ],
      d(2025, 8, 24),
      null,
    );
    expect(parts.map((p) => p.days)).toEqual([23, 7]);

    const result = computeContractAllowances(
      slices(
        [{ transport: 2550, bonus: 56000 }, { transport: 2800, bonus: 60846.16 }],
        [parts[0].days, parts[1].days],
      ),
      30, 30, 30, PRORATED, false,
    );
    expect(result.transport).toBeCloseTo(2608.33, 2);
    expect(result.monthlyBonus).toBeCloseTo(57130.77, 2);
  });

  it('same-salary renewal → same totals as full month', () => {
    // Renewal on Aug 10 with identical basic/allowances → totals equal full month
    const parts = allocateContractPayrollDays(
      8, 2026,
      [
        { id: 'old', startDate: d(2025, 1, 1), endDate: d(2026, 8, 9) },
        { id: 'new', startDate: d(2026, 8, 10), endDate: null },
      ],
      d(2025, 1, 1),
      null,
    );
    const result = computeContractAllowances(
      slices(
        [{ transport: 2550, bonus: 56000 }, { transport: 2550, bonus: 56000 }],
        [parts[0].days, parts[1].days],
      ),
      30, 30, 30, PRORATED, false,
    );
    expect(result.transport).toBe(2550);
    expect(result.monthlyBonus).toBe(56000);
  });

  it('fully absent month → 0 (no slices)', () => {
    // The run service zeroes out allowances for fully-absent months;
    // an empty slices array also returns 0.
    const result = computeContractAllowances([], 0, 0, 0, PRORATED, false);
    expect(result.transport).toBe(0);
    expect(result.monthlyBonus).toBe(0);
  });

  it('leaver Aug 20 → × 20/30 in PRORATED mode', () => {
    const employedDays = employedPayrollDays(8, 2026, d(2025, 1, 1), d(2026, 8, 20)).days;
    expect(employedDays).toBe(20);
    const result = computeContractAllowances(
      [{ transportationAllowance: 2550, monthlyBonus: 56000, allocatedDays: employedDays }],
      employedDays, employedDays, 30, PRORATED, false,
    );
    expect(result.transport).toBeCloseTo(2550 * 20 / 30, 2);
    expect(result.monthlyBonus).toBeCloseTo(56000 * 20 / 30, 2);
  });

  it('leaver Aug 20 → full amounts in FULL mode', () => {
    const employedDays = 20;
    const noLeaverDays = 30; // would be 30 had they not left
    const result = computeContractAllowances(
      [{ transportationAllowance: 2550, monthlyBonus: 56000, allocatedDays: employedDays }],
      employedDays, employedDays, noLeaverDays, FULL, false,
    );
    expect(result.transport).toBe(2550);
    expect(result.monthlyBonus).toBe(56000);
  });

  it('ALLOWANCES_REDUCED_BY_ABSENCE=true, 2 absences on full month → × 28/30', () => {
    const totalEmployedDays = 30;
    const payrollDays = 28; // 2 absent days
    const result = computeContractAllowances(
      [{ transportationAllowance: 2550, monthlyBonus: 56000, allocatedDays: 30 }],
      totalEmployedDays, payrollDays, totalEmployedDays, PRORATED, true,
    );
    expect(result.transport).toBeCloseTo(2550 * 28 / 30, 2);
    expect(result.monthlyBonus).toBeCloseTo(56000 * 28 / 30, 2);
  });

  it('ALLOWANCES_REDUCED_BY_ABSENCE default (false) → absences do not reduce allowances', () => {
    const totalEmployedDays = 30;
    const payrollDays = 28;
    const result = computeContractAllowances(
      [{ transportationAllowance: 2550, monthlyBonus: 56000, allocatedDays: 30 }],
      totalEmployedDays, payrollDays, totalEmployedDays, PRORATED,
      ALLOWANCES_REDUCED_BY_ABSENCE,
    );
    expect(result.transport).toBe(2550);
    expect(result.monthlyBonus).toBe(56000);
  });

  it('config LEAVER_ALLOWANCE_MODE defaults to PRORATED', () => {
    expect(LEAVER_ALLOWANCE_MODE).toBe('PRORATED');
  });

  it('config ALLOWANCES_REDUCED_BY_ABSENCE defaults to false', () => {
    expect(ALLOWANCES_REDUCED_BY_ABSENCE).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Abenezer full payroll calculation test
// ---------------------------------------------------------------------------

describe('Abenezer Aug 2026 - full payroll with mid-month renewal', () => {
  /**
   * Abenezer Tilahun: old contract 50,000 / 2,550 / 56,000 (Aug 1-23)
   * new contract 70,000 / 2,800 / 60,846.16 (Aug 24–31, 7 payroll days)
   * OT from old contract only: N=26.5 h, E=10.5 h, W=28 h, H=0 h
   *
   * Expected: earned 54,666.67 · bonus 57,130.77 · transport 2,608.33
   *           pension 3,826.67 · taxable 141,517.48 · tax 47,481.12
   */
  const OLD = { basic: 50000, transport: 2550, bonus: 56000 };
  const NEW = { basic: 70000, transport: 2800, bonus: 60846.16 };

  const calc = new PayrollCalculationService();

  const allocationDays = [23, 7];
  const totalEmployedDays = 30;
  const payrollDays = 30;

  // Earned: Σ basic/30 × days
  const earned = round2(
    OLD.basic / 30 * allocationDays[0] + NEW.basic / 30 * allocationDays[1],
  );

  // Prorated allowances
  const allowances = computeContractAllowances(
    slices([{ transport: OLD.transport, bonus: OLD.bonus }, { transport: NEW.transport, bonus: NEW.bonus }], allocationDays),
    totalEmployedDays, payrollDays, totalEmployedDays,
    LEAVER_ALLOWANCE_MODE, ALLOWANCES_REDUCED_BY_ABSENCE,
  );

  // OT priced with OLD basic (contract in force on the entry dates, Aug 1–23)
  const oldHourly = OLD.basic / 192;
  const otPay = {
    normalOtPay: round2(oldHourly * 26.5 * 1.5),
    eveningOtPay: round2(oldHourly * 10.5 * 1.75),
    sundayOtPay: round2(oldHourly * 28 * 2.0),
    holidayOtPay: 0,
  };

  it('earned salary is 54,666.67', () => {
    expect(earned).toBeCloseTo(54666.67, 2);
  });

  it('prorated bonus is 57,130.77', () => {
    expect(allowances.monthlyBonus).toBeCloseTo(57130.77, 2);
  });

  it('prorated transport is 2,608.33', () => {
    expect(allowances.transport).toBeCloseTo(2608.33, 2);
  });

  it('full calculation: pension, taxable, tax', () => {
    const result = calc.calculate({
      basicSalary: NEW.basic,
      transportAllowance: allowances.transport,
      monthlyBonus: allowances.monthlyBonus,
      bonusTopUp: 0,
      payrollDays,
      earnedSalary: earned,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      overtimePay: otPay,
      taxableThreshold: 2200,
      pensionApplicable: true,
      taxApplicable: true,
    });

    expect(result.earnedSalary).toBeCloseTo(54666.67, 2);
    expect(result.pensionEmployee).toBeCloseTo(3826.67, 2);
    // taxable = earned + bonus + OT (transport is non-taxable at CCECC)
    expect(result.taxableIncome).toBeCloseTo(141517.48, 0);
    expect(result.incomeTax).toBeCloseTo(47481.12, 2);
  });
});
