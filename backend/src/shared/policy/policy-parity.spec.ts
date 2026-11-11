import { describe, expect, it } from '@jest/globals';
import {
  POLICY_DEFAULTS,
  POLICY_DEFINITIONS,
  incomeTaxFromBrackets,
  validateAgainstSnapshot,
  validateTaxBrackets,
  type PolicyValues,
} from './policy-definitions';
import { loadPolicySnapshot, resolvePolicyValues } from './policy-reader.util';
import { PayrollCalculationService } from '../../modules/payroll/application/services/payroll-calculation.service';
import { calculateOvertimePay } from '../../modules/payroll/application/utils/payroll-overtime.util';
import { lateArrivalDeduction } from '../../modules/attendance/application/utils/early-departure.util';
import { enrolmentGraceDateKeys } from '../../modules/attendance/application/utils/enrolment-grace.util';
import { dayDeduction, type DayDeductionContext } from '../../modules/attendance/application/utils/day-deduction.util';

const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

/** The Ethiopian table exactly as it was hard-coded before policy settings. */
function legacyIncomeTax(taxable: number): number {
  if (taxable <= 2000) return 0;
  if (taxable <= 4000) return taxable * 0.15 - 300;
  if (taxable <= 7000) return taxable * 0.2 - 500;
  if (taxable <= 10000) return taxable * 0.25 - 850;
  if (taxable <= 14000) return taxable * 0.3 - 1350;
  return taxable * 0.35 - 2050;
}

function legacyOtPay(basic: number, h: { normalHours: number; eveningHours: number; sundayHours: number; holidayHours: number }) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const normal = r2((basic / 192) * h.normalHours * 1.5);
  const evening = r2((basic / 192) * h.eveningHours * 1.75);
  const sunday = r2((basic / 192) * h.sundayHours * 2.0);
  const holiday = r2((basic / 196) * h.holidayHours * 2.5);
  return { normal, evening, sunday, holiday };
}

describe('policy defaults = the agreed rules', () => {
  it('matches every former hard-coded value, except the three agreed changes', () => {
    expect(POLICY_DEFAULTS).toMatchObject({
      lateGraceMinutes: 15, // LATE_ARRIVAL_GRACE_MINUTES
      lateDeductionMode: 'REPORT_ONLY', // lates were flag-only
      earlyDepartureGraceMinutes: 15, // agreed 2026-10-15 (was EARLY_DEPARTURE_GRACE_MINUTES = 30)
      earlyDepartureDeductMinutes: 60, // EARLY_DEPARTURE_DEDUCT_MINUTES
      earlyDepartureMode: 'REPORT_ONLY', // EARLY_DEPARTURE_DEDUCTION_MODE
      enrolmentGraceWorkingDays: 5, // agreed 2026-10-15: present until first scan, max 5 working days (was uncapped)
      forgotToClockFlagThreshold: 3, // FORGOT_TO_CLOCK_FLAG_THRESHOLD
      unpaidLeaveCountsRestDays: false, // agreed 2026-10-15: rest days inside unpaid leave stay paid (was true)
      monthDays: 30, // PAYROLL_MONTH_DAYS
      leaverAllowanceMode: 'PRORATED', // LEAVER_ALLOWANCE_MODE
      allowancesReducedByAbsence: false, // ALLOWANCES_REDUCED_BY_ABSENCE
      pensionEmployeePct: 7,
      pensionEmployerPct: 11,
      transportTaxable: false,
      hoursDivisor: 192,
      holidayHoursDivisor: 196,
      multipliers: { regular: 1.5, night: 1.75, weekend: 2, holiday: 2.5 },
      lunchCountsAsOvertime: false, // LUNCH_COUNTS_AS_OVERTIME
    });
  });

  it('every default passes its own validation', () => {
    for (const def of POLICY_DEFINITIONS) {
      expect([def.key, def.validate(POLICY_DEFAULTS[def.key])]).toEqual([def.key, null]);
    }
  });

  it('percent arithmetic is bit-identical to the old literals', () => {
    expect(7 / 100).toBe(0.07);
    expect(11 / 100).toBe(0.11);
    for (const rate of [15, 20, 25, 30, 35]) {
      expect(rate / 100).toBe(Number(`0.${rate}`));
    }
  });

  it('income tax from default bands equals the old table for every tested income', () => {
    for (let income = 0; income <= 250_000; income += 13.37) {
      expect(incomeTaxFromBrackets(income, POLICY_DEFAULTS.incomeTaxBrackets)).toBe(legacyIncomeTax(income));
    }
    for (const edge of [2000, 2000.01, 4000, 7000, 10000, 14000, 14000.01]) {
      expect(incomeTaxFromBrackets(edge, POLICY_DEFAULTS.incomeTaxBrackets)).toBe(legacyIncomeTax(edge));
    }
  });

  it('overtime pay with default rates equals the old ÷192/÷196 × 1.5/1.75/2/2.5 formula', () => {
    for (const basic of [18000, 30000, 50000, 70000, 123456.78]) {
      const hours = { normalHours: 26.5, eveningHours: 10.5, sundayHours: 28, holidayHours: 7.25 };
      const pay = calculateOvertimePay(basic, hours);
      const old = legacyOtPay(basic, hours);
      expect([pay.normalOtPay, pay.eveningOtPay, pay.sundayOtPay, pay.holidayOtPay]).toEqual([
        old.normal,
        old.evening,
        old.sunday,
        old.holiday,
      ]);
    }
  });

  it('payroll calculation: explicit default policy == no policy (identical results)', () => {
    const calc = new PayrollCalculationService();
    const cases = [
      { basicSalary: 50000, transportAllowance: 2550, monthlyBonus: 56000, payrollDays: 30 },
      { basicSalary: 18000, transportAllowance: 600, monthlyBonus: 0, payrollDays: 17.5 },
      { basicSalary: 70000, transportAllowance: 2800, monthlyBonus: 60846.16, payrollDays: 7 },
    ];
    for (const c of cases) {
      const input = {
        ...c,
        bonusTopUp: 1000,
        contractNetBonus: 500,
        netTopUp: 250,
        overtimeHours: { normalHours: 6, eveningHours: 2, sundayHours: 4, holidayHours: 3 },
        taxableThreshold: 2200,
      };
      expect(calc.calculate({ ...input, policy: POLICY_DEFAULTS })).toEqual(calc.calculate(input));
    }
  });
});

describe('effective dating', () => {
  const row = (key: string, value: unknown, from: Date, createdAt = new Date('2026-10-01T00:00:00Z')) => ({
    key,
    value,
    effectiveFrom: from,
    createdAt,
  });

  it('a December change does not affect November', () => {
    const rows = [row('multipliers', { regular: 2, night: 2, weekend: 3, holiday: 3 }, d(2026, 12, 1))];
    expect(resolvePolicyValues(rows, d(2026, 11, 1)).multipliers).toEqual(POLICY_DEFAULTS.multipliers);
    expect(resolvePolicyValues(rows, d(2026, 12, 1)).multipliers.regular).toBe(2);
    expect(resolvePolicyValues(rows, d(2027, 3, 1)).multipliers.regular).toBe(2);
  });

  it('later versions supersede earlier ones from their own month; same month → latest saved wins', () => {
    const rows = [
      row('pensionEmployeePct', 8, d(2026, 12, 1), new Date('2026-10-01T00:00:00Z')),
      row('pensionEmployeePct', 9, d(2027, 2, 1), new Date('2026-10-02T00:00:00Z')),
      row('pensionEmployeePct', 8.5, d(2026, 12, 1), new Date('2026-10-03T00:00:00Z')),
    ];
    expect(resolvePolicyValues(rows, d(2026, 11, 1)).pensionEmployeePct).toBe(7);
    expect(resolvePolicyValues(rows, d(2027, 1, 1)).pensionEmployeePct).toBe(8.5);
    expect(resolvePolicyValues(rows, d(2027, 2, 1)).pensionEmployeePct).toBe(9);
  });

  it('an invalid stored value falls back to the default instead of breaking a run', () => {
    const rows = [row('hoursDivisor', 'oops', d(2026, 1, 1))];
    expect(resolvePolicyValues(rows, d(2026, 6, 1)).hoursDivisor).toBe(192);
  });

  it('loadPolicySnapshot resolves for the month of the given date and caches per client', async () => {
    let calls = 0;
    const db = {
      policySetting: {
        findMany: async () => {
          calls += 1;
          return [row('hoursDivisor', 200, d(2026, 12, 1))];
        },
      },
    };
    const nov = await loadPolicySnapshot(db as never, 'c1', d(2026, 11, 30));
    const dec = await loadPolicySnapshot(db as never, 'c1', d(2026, 12, 15));
    expect(nov.hoursDivisor).toBe(192);
    expect(dec.hoursDivisor).toBe(200);
    expect(calls).toBe(1);
    // December OT is priced with the December divisor; November is unchanged.
    const hours = { normalHours: 10, eveningHours: 0, sundayHours: 0, holidayHours: 0 };
    expect(calculateOvertimePay(48000, hours, nov).normalOtPay).toBe(3750);
    expect(calculateOvertimePay(48000, hours, dec).normalOtPay).toBe(3600);
  });
});

describe('validation', () => {
  it('tax bands: ascending limits, open last band, rates 0–100', () => {
    expect(validateTaxBrackets(POLICY_DEFAULTS.incomeTaxBrackets)).toBeNull();
    expect(validateTaxBrackets([])).toMatch(/At least one/);
    expect(validateTaxBrackets([{ upTo: 1000, rate: 10, deduction: 0 }])).toMatch(/last band/);
    expect(
      validateTaxBrackets([
        { upTo: 4000, rate: 10, deduction: 0 },
        { upTo: 2000, rate: 20, deduction: 0 },
        { upTo: null, rate: 30, deduction: 0 },
      ]),
    ).toMatch(/greater than the previous/);
    expect(validateTaxBrackets([{ upTo: null, rate: 120, deduction: 0 }])).toMatch(/0–100/);
  });

  it('per-key rules', () => {
    const byKey = new Map(POLICY_DEFINITIONS.map((p) => [p.key, p]));
    expect(byKey.get('lateGraceMinutes')!.validate(-1)).not.toBeNull();
    expect(byKey.get('lateGraceMinutes')!.validate(10.5)).not.toBeNull();
    expect(byKey.get('lateDeductionMode')!.validate('SOMETIMES')).not.toBeNull();
    expect(byKey.get('monthDays')!.validate(26)).toMatch(/Fixed at 30/);
    expect(byKey.get('multipliers')!.validate({ regular: 1.5, night: 1.75, weekend: 2 })).not.toBeNull();
    expect(byKey.get('enrolmentGraceWorkingDays')!.validate(null)).toBeNull();
    expect(byKey.get('enrolmentGraceWorkingDays')!.validate(5)).toBeNull();
    expect(byKey.get('inactiveCanLogin')!.validate({ SUSPENDED: true, LONG_LEAVE: true })).not.toBeNull();
    expect(byKey.get('severancePay')!.validate({ enabled: true, parameters: { monthsPerYear: 1 } })).toBeNull();
  });

  it('cross-field: early-departure deduct threshold must exceed the grace', () => {
    expect(validateAgainstSnapshot('earlyDepartureDeductMinutes', 15, POLICY_DEFAULTS as PolicyValues)).toMatch(/longer/);
    expect(validateAgainstSnapshot('earlyDepartureGraceMinutes', 60, POLICY_DEFAULTS as PolicyValues)).toMatch(/shorter/);
    expect(validateAgainstSnapshot('earlyDepartureDeductMinutes', 90, POLICY_DEFAULTS as PolicyValues)).toBeNull();
  });
});

describe('attendance policies', () => {
  it('late arrivals: REPORT_ONLY never deducts; ENFORCED 2 lates = 0.5 day', () => {
    expect(lateArrivalDeduction(9)).toBe(0);
    expect(lateArrivalDeduction(1, 'ENFORCED', 2)).toBe(0);
    expect(lateArrivalDeduction(2, 'ENFORCED', 2)).toBe(0.5);
    expect(lateArrivalDeduction(5, 'ENFORCED', 2)).toBe(1);
  });

  it('enrolment grace cap: default 5 working days; null = uncapped; N caps working days', () => {
    const params = {
      hireDate: d(2026, 9, 1),
      firstScanDate: null,
      throughDate: d(2026, 9, 30),
      isPublicHoliday: () => false,
    };
    const uncapped = enrolmentGraceDateKeys(params);
    expect(enrolmentGraceDateKeys({ ...params, maxWorkingDays: null })).toEqual(uncapped);
    expect(enrolmentGraceDateKeys({ ...params, maxWorkingDays: 3 }).size).toBe(3);
    expect(enrolmentGraceDateKeys({ ...params, maxWorkingDays: POLICY_DEFAULTS.enrolmentGraceWorkingDays }).size).toBe(5);
  });

  it('unpaid leave on a day off: stays a paid day off by default, counted when the policy is on', () => {
    const sunday = d(2026, 10, 11);
    const base: DayDeductionContext = {
      isPublicHoliday: () => false,
      isWorkFromHome: () => false,
      siteNameForDate: () => null,
      isOnApprovedLeave: () => false,
      isOnUnpaidLeave: () => true,
      fieldMovementCoverage: () => 'NONE',
    };
    const day = { date: sunday, clockIn: null, clockOut: null, isLastExportDay: false, scheduledEnd: '17:30' };
    expect(dayDeduction(sunday, day, base).status).toBe('DAY_OFF');
    expect(dayDeduction(sunday, day, { ...base, unpaidLeaveCountsRestDays: true }).status).toBe('UNPAID_LEAVE');
  });

  it('early-departure thresholds come from the context policy', () => {
    const ctx: DayDeductionContext = {
      isPublicHoliday: () => false,
      isWorkFromHome: () => false,
      siteNameForDate: () => null,
      isOnApprovedLeave: () => false,
      fieldMovementCoverage: () => 'NONE',
      earlyDepartureMode: 'ENFORCED',
    };
    const monday = d(2026, 10, 12);
    const day = { date: monday, clockIn: '08:30', clockOut: '16:40', isLastExportDay: false, scheduledEnd: '17:30' };
    expect(dayDeduction(monday, day, ctx).deduction).toBe(0); // 50 min early: flag only by default
    expect(
      dayDeduction(monday, day, { ...ctx, earlyDepartureGraceMinutes: 10, earlyDepartureDeductMinutes: 40 })
        .deduction,
    ).toBe(0.5);
  });
});
