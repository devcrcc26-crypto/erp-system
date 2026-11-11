import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { PayrollCalculationService } from './payroll-calculation.service';

const ZERO_OT = {
  normalHours: 0,
  eveningHours: 0,
  sundayHours: 0,
  holidayHours: 0,
};

/** August sheet row 1: basic 13,000 + transport 900 + taxable bonus 14,630.77. */
const AUGUST_ROW1 = {
  basicSalary: 13000,
  transportAllowance: 900,
  monthlyBonus: 14630.77,
  bonusTopUp: 0,
  payrollDays: 30,
  overtimeHours: ZERO_OT,
  taxableThreshold: 2200,
  pensionApplicable: true,
  taxApplicable: true,
} as const;

describe('PayrollCalculationService', () => {
  const calc = new PayrollCalculationService();

  describe('net bonus (after tax)', () => {
    it('basic August row 1 with no net bonus → tax 7,620.77, net 20,000.00', () => {
      const result = calc.calculate({ ...AUGUST_ROW1 });
      expect(result.incomeTax).toBeCloseTo(7620.77, 2);
      expect(result.totalNetBonus).toBe(0);
      expect(result.netPay).toBeCloseTo(20000, 2);
    });

    it('same + contract net bonus 2,000 → tax unchanged, net 22,000.00', () => {
      const result = calc.calculate({
        ...AUGUST_ROW1,
        contractNetBonus: 2000,
      });
      expect(result.incomeTax).toBeCloseTo(7620.77, 2);
      expect(result.taxableIncome).toBeCloseTo(
        calc.calculate({ ...AUGUST_ROW1 }).taxableIncome,
        2,
      );
      expect(result.totalNetBonus).toBeCloseTo(2000, 2);
      expect(result.netPay).toBeCloseTo(22000, 2);
    });

    it('same + one-time net top-up 30,000 → net 50,000.00, tax unchanged', () => {
      const result = calc.calculate({
        ...AUGUST_ROW1,
        netTopUp: 30000,
      });
      expect(result.incomeTax).toBeCloseTo(7620.77, 2);
      expect(result.totalNetBonus).toBeCloseTo(30000, 2);
      expect(result.netPay).toBeCloseTo(50000, 2);
    });

    it('taxable bonus top-up of 5,000 in 35% bracket → net rises by 3,250', () => {
      const base = calc.calculate({ ...AUGUST_ROW1 });
      const topped = calc.calculate({
        ...AUGUST_ROW1,
        bonusTopUp: 5000,
      });
      expect(topped.netPay - base.netPay).toBeCloseTo(3250, 2);
      expect(topped.incomeTax - base.incomeTax).toBeCloseTo(1750, 2);
    });

    it('taxable top-up 5,000 + net top-up 5,000 → net rises by 8,250', () => {
      const base = calc.calculate({ ...AUGUST_ROW1 });
      const both = calc.calculate({
        ...AUGUST_ROW1,
        bonusTopUp: 5000,
        netTopUp: 5000,
      });
      expect(both.netPay - base.netPay).toBeCloseTo(8250, 2);
    });

    it('paid days 15 → contract net bonus is still paid in full', () => {
      const result = calc.calculate({
        ...AUGUST_ROW1,
        payrollDays: 15,
        contractNetBonus: 2000,
      });
      expect(result.totalNetBonus).toBeCloseTo(2000, 2);
      const without = calc.calculate({
        ...AUGUST_ROW1,
        payrollDays: 15,
      });
      expect(result.netPay - without.netPay).toBeCloseTo(2000, 2);
    });
  });

  describe('solveBonusForNet', () => {
    it('matches August sheet row 1 (basic 13000, transport 900, net 20000)', () => {
      const bonus = calc.solveBonusForNet({
        basicSalary: 13000,
        transportAllowance: 900,
        targetNet: 20000,
        taxableThreshold: 2200,
        pensionApplicable: true,
        taxApplicable: true,
      });

      expect(bonus).toBeCloseTo(14630.77, 2);

      const result = calc.calculate({
        basicSalary: 13000,
        transportAllowance: 900,
        monthlyBonus: bonus,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: ZERO_OT,
        taxableThreshold: 2200,
        pensionApplicable: true,
        taxApplicable: true,
      });

      expect(result.pensionEmployee).toBeCloseTo(910, 2);
      expect(result.incomeTax).toBeCloseTo(7620.77, 2);
      expect(result.netPay).toBeCloseTo(20000, 2);
    });

    it('throws when target net is below basic+transport take-home', () => {
      expect(() =>
        calc.solveBonusForNet({
          basicSalary: 13000,
          transportAllowance: 900,
          targetNet: 1000,
          taxableThreshold: 2200,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('pensionApplicable / taxApplicable', () => {
    it('zeros pension when pensionApplicable is false', () => {
      const result = calc.calculate({
        basicSalary: 13000,
        transportAllowance: 900,
        monthlyBonus: 0,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: ZERO_OT,
        taxableThreshold: 2200,
        pensionApplicable: false,
        taxApplicable: true,
      });
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
    });

    it('zeros tax when taxApplicable is false', () => {
      const result = calc.calculate({
        basicSalary: 13000,
        transportAllowance: 900,
        monthlyBonus: 14630.77,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: ZERO_OT,
        taxableThreshold: 2200,
        pensionApplicable: true,
        taxApplicable: false,
      });
      expect(result.incomeTax).toBe(0);
    });
  });

  describe('overtime from basic (not earned)', () => {
    it('basic 15,000, earned 12,000, 8 h Normal → 937.50 (not 750)', () => {
      const result = calc.calculate({
        basicSalary: 15000,
        transportAllowance: 0,
        monthlyBonus: 0,
        bonusTopUp: 0,
        payrollDays: 24,
        earnedSalary: 12000,
        overtimeHours: {
          normalHours: 8,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
        taxableThreshold: 2200,
      });
      // 15000/192 × 8 × 1.5 = 937.5
      expect(result.normalOtPay).toBeCloseTo(937.5, 2);
      expect(result.normalOtPay).not.toBeCloseTo(750, 2);
    });
  });

  describe('pension on earned salary', () => {
    it('basic 15,000, paid days 24 → earned 12,000 → 7% = 840, 11% = 1,320', () => {
      const result = calc.calculate({
        basicSalary: 15000,
        transportAllowance: 0,
        monthlyBonus: 0,
        bonusTopUp: 0,
        payrollDays: 24,
        overtimeHours: ZERO_OT,
        taxableThreshold: 2200,
        pensionApplicable: true,
      });
      expect(result.earnedSalary).toBeCloseTo(12000, 2);
      expect(result.pensionEmployee).toBeCloseTo(840, 2);
      expect(result.pensionEmployer).toBeCloseTo(1320, 2);
    });
  });

  describe('transport and bonus paid in full', () => {
    it('joiner Sep 5 (26 paid days): transport 2,000 and bonus 5,000 unpaid-prorated', () => {
      const result = calc.calculate({
        basicSalary: 15000,
        transportAllowance: 2000,
        monthlyBonus: 5000,
        bonusTopUp: 0,
        payrollDays: 26,
        overtimeHours: ZERO_OT,
        taxableThreshold: 2200,
      });
      expect(result.nonTaxableTransport).toBeCloseTo(2000, 2);
      expect(result.grossIncome).toBeCloseTo(
        result.earnedSalary + 2000 + 5000,
        2,
      );
    });
  });

  describe('fully absent working days (payroll run zeros allowances)', () => {
    it('paid days 0 + 6 h Normal OT → OT paid; transport and bonus 0; pension 0', () => {
      const result = calc.calculate({
        basicSalary: 30000,
        transportAllowance: 0,
        monthlyBonus: 0,
        bonusTopUp: 0,
        contractNetBonus: 0,
        netTopUp: 0,
        payrollDays: 0,
        earnedSalary: 0,
        overtimeHours: {
          normalHours: 6,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
        taxableThreshold: 2200,
        pensionApplicable: false,
      });
      expect(result.payrollDays).toBe(0);
      expect(result.earnedSalary).toBe(0);
      expect(result.normalOtPay).toBeCloseTo((30000 / 192) * 6 * 1.5, 2);
      expect(result.totalOtPay).toBeGreaterThan(0);
      expect(result.nonTaxableTransport).toBe(0);
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
      expect(result.grossIncome).toBeCloseTo(result.totalOtPay, 2);
    });
  });

  describe('tax once on whole month taxable income', () => {
    it('salary change: taxable income is sum of both periods, taxed once', () => {
      const earned = 68000; // 50k/30×3 + 70k/30×27
      const result = calc.calculate({
        basicSalary: 70000,
        transportAllowance: 0,
        monthlyBonus: 0,
        bonusTopUp: 0,
        payrollDays: 30,
        earnedSalary: earned,
        overtimeHours: ZERO_OT,
        taxableThreshold: 2200,
      });
      expect(result.taxableIncome).toBeCloseTo(earned, 2);
      expect(result.incomeTax).toBeCloseTo(
        calc.calculateIncomeTax(earned),
        2,
      );
    });
  });
});
